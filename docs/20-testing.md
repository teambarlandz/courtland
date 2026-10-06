# 20 — Testing

Four tiers, each testing something the tier below cannot. The rule that shapes everything: **a test that
cannot fail is a liability**, so every test asserts an observable outcome, and a test that has never failed
is a test that needs deleting.

## 1. The pyramid

```
        ╱ E2E ╲              ~40 tests    Playwright, real browser, real API
      ╱─────────╲
     ╱ Component  ╲          ~180 tests   Vitest + Testing Library
    ╱───────────────╲
   ╱   Unit + Integration ╲ ~700 tests   Vitest, Vitest+Postgres, MSW
  ╱─────────────────────────╲
 ╱      Contract + DB        ╲ ~120 tests Zod schemas, pgTAP, OpenAPI drift
╱─────────────────────────────╲
```

Roughly 1,000 tests. The ratio matters more than the count: a suite dominated by E2E is slow and flaky, and
a suite with no E2E cannot catch a broken login.

## 2. Coverage targets

| Tier | Target | Enforced by |
|---|---|---|
| `packages/*` | 90% lines, 90% branches | Vitest coverage thresholds |
| `apps/api` | 85% lines | Same |
| `apps/web`, `apps/admin` | 70% lines | Same |
| `supabase/migrations` | pgTAP assertions on every table's RLS | pgTAP, no numeric threshold |
| Overall | 80% lines | CI gate |

Coverage is a floor, not a goal. A file at 95% coverage because it has one function with eleven uncovered
branches is worse than a file at 80% where the uncovered 20% is unreachable error handling. The threshold
catches accidental gaps; the review catches the rest.

## 3. Unit tests

Pure functions, no I/O. Fast, many, boring.

| Area | Examples |
|---|---|
| Money | `formatNaira`, `parseNaira`, `splitAnnualRent`, `allocatePayment`, `koboToNaira` |
| Billing | `generateLeaseSchedule`, `generateSaleSchedule`, `buildPeriods`, escalation cap |
| Permissions | Every permission has a matrix row; `hasPermission` for each role |
| Status | Every status has a colour; every transition is in the allowed set |
| Filters | Query-param parsing, cursor encode and decode |
| Validation | Every Zod schema: valid inputs, boundary values, invalid inputs |
| Templates | Every notification and PDF template renders with fixture data |
| Scheduling | `buildPeriods` across month lengths, leap years, 29–31 day due dates |

### 3.1 A representative test

```ts
// packages/utils/src/money.test.ts
describe('splitAnnualRent', () => {
  it.each([
    [45000000n, 12n, 12],          // divisible
    [5000000n, 12n, 12],           // not divisible: 4,166,666.67
    [5250000n, 12n, 12],           // divisible
    [100000n, 3n, 3],              // not divisible
    [1n, 12n, 12],                 // 1 kobo over 12 months
  ])('splits %s kobo into %s months of %s', (annual, months, count) => {
    const parts = splitAnnualRent(annual, months)

    expect(parts).toHaveLength(Number(count))
    // The invariant that matters: the instalments sum to exactly the annual rent.
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(annual)
    // And no instalment is more than one kobo above the floor.
    const max = parts.reduce((a, b) => (a > b ? a : b), 0n)
    const min = parts.reduce((a, b) => (a < b ? a : b), 0n)
    expect(max - min).toBeLessThanOrEqual(1n)
  })

  it('never loses kobo to floating point', () => {
    const parts = splitAnnualRent(33333333n, 12n)
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(33333333n)
    // A float implementation would give 33333332.999999996
  })
})
```

The `max - min <= 1` assertion is the property that makes this correct, and it is the assertion a
floating-point implementation fails first.

### 3.2 Property-based testing

Where the input space is large and the invariant is simple, `fast-check` finds the edge case.

```ts
import fc from 'fast-check'

it('always splits into the right number of instalments that sum exactly', () => {
  fc.assert(fc.property(
    fc.bigInt({ min: 1n, max: 100_000_000_000n }),
    fc.integer({ min: 1, max: 60 }),
    (annual, months) => {
      const parts = splitAnnualRent(annual, BigInt(months))
      expect(parts).toHaveLength(months)
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(annual)
    },
  ))
})
```

This finds the February problem and the 60-month problem without anyone thinking to write them down.

## 4. Integration tests

### 4.1 Database integration

Vitest runs against a real Postgres from `supabase start`. Not a mock: a mock of Postgres is a mock of
nothing, because the things that break in practice are `bigint` arithmetic, `check` constraints, and RLS.

```ts
// apps/api/test/integration/contracts.test.ts
describe('contract creation', () => {
  beforeAll(async () => { db = await getTestDb() })
  beforeEach(async () => { await truncateAll() })

  it('generates a schedule that sums to the contractual total', async () => {
    const contract = await withRls(db, adminIdentity, (tx) =>
      createContract(tx, { kind: 'lease', rentAmountKobo: 45000000n, termMonths: 12, rentPeriod: 'annual' }))

    const total = await withRls(db, adminIdentity, (tx) =>
      sumScheduleAmount(tx, contract.id))

    expect(total).toBe(45000000n)
  })

  it('refuses to activate without a verified payout account', async () => {
    await expect(
      withRls(db, adminIdentity, (tx) => activateContract(tx, draftContract.id)),
    ).rejects.toThrow(BusinessRuleError)
  })
})
```

`truncateAll` resets between tests so ordering cannot mask a failure.

### 4.2 API integration

Vitest + supertest against the real Express app with a real database and a mocked provider.

```ts
describe('POST /v1/payment-intents', () => {
  it('creates an intent for the outstanding schedule row', async () => {
    const res = await request(app)
      .post('/v1/payment-intents')
      .set('Authorization', `Bearer ${tenantToken}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ contractId, scheduleSeqs: [3] })

    expect(res.status).toBe(201)
    expect(res.body.data.amountKobo).toBe(3750000)
  })

  it('403s when the caller is not a party to the contract', async () => {
    const res = await request(app)
      .post('/v1/payment-intents')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ contractId, scheduleSeqs: [3] })
    expect(res.status).toBe(403)
  })

  it('replays the same response for the same Idempotency-Key', async () => {
    const key = crypto.randomUUID()
    const a = await request(app).post('/v1/payment-intents')
      .set('Authorization', `Bearer ${tenantToken}`).set('Idempotency-Key', key).send(body)
    const b = await request(app).post('/v1/payment-intents')
      .set('Authorization', `Bearer ${tenantToken}`).set('Idempotency-Key', key).send(body)

    expect(b.status).toBe(201)
    expect(b.body.data.id).toBe(a.body.data.id)
    expect(countIntents()).toBe(1)
  })
})
```

The last test is the one that matters most in this file: it asserts the count is 1, so a duplicate is a
failure rather than a slightly different response.

### 4.3 Provider integration

Mocked, with contract tests against recorded fixtures.

| Provider | Mocked with | Fixtures |
|---|---|---|
| Paystack | `nock` | Recorded initialise, verify, transfer, webhook payloads |
| Cloudinary | `nock` | Upload, transform, signed URL |
| Resend | `nock` | Send, bounce, complaint |
| SMS | A fake provider class | Accepted, delivered, rejected, timeout |
| Inngest | In-memory driver | Function runs, step replay |

Fixture files live in `apps/api/test/fixtures/providers/` and are captured from the sandbox, scrubbed of
real identifiers. A webhook test asserts a signature mismatch is 401, which is the test that proves
verification is real.

## 5. Database tests (pgTAP)

Runs against a real Supabase local instance, as `supabase test db`.

```
supabase/tests/
  helpers.sql              identity-setting helpers
  extensions.test.sql      required extensions present
  tables.test.sql          every expected table exists with expected columns and types
  rls_enabled.test.sql     every table in public has RLS on
  grants.test.sql          no client grant without a policy
  policies_*.test.sql      one file per table group
  invariants_ledger.test.sql
  invariants_schedule.test.sql
  triggers.test.sql
  views.test.sql
  seed.test.sql
```

### 5.1 A representative pgTAP test

```sql
begin;
  select plan(8);

  select set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated",
      "app_metadata":{"courtland_roles":["tenant"]}}', true);

  -- Allow: the tenant sees their own contract
  select results_eq(
    $$ select count(*)::text from public.contracts $$,
    $$ values ('1'::text) $$, 'tenant sees their own contract');

  -- Deny: the tenant sees no other contract
  select is_empty(
    $$ select id from public.contracts where primary_payer_id <> '11111111-1111-1111-1111-111111111111' $$,
    'tenant sees no other contract');

  -- Deny: the tenant cannot update a contract
  select throws_ok(
    $$ update public.contracts set status = 'terminated' where id = (select id from public.contracts limit 1) $$,
    '42501', 'new row violates row-level security policy',
    'tenant cannot update a contract');

  -- Deny: the tenant cannot read the ledger
  select throws_ok($$ select * from public.payments_ledger $$, '42501', ...,
    'tenant cannot select payments_ledger');

  select * from finish();
rollback;
```

Every test runs in a transaction and rolls back, so tests cannot interfere with each other and a failed run
leaves no residue.

### 5.2 The three coverage rules

| Rule | Test |
|---|---|
| Every table has RLS | `rls_enabled.test.sql` queries `pg_class` for `relrowsecurity = false` in `public` |
| Every grant has a policy | `grants.test.sql` compares `information_schema.role_table_grants` to `pg_policies` |
| Every policy is tested | A count: for each policy in `pg_policies`, at least one `pgtap` assertion mentions its table and operation. Counted against a fixed list, because inferring this is a research project |

## 6. Component tests

Vitest + Testing Library + `vitest-axe`, testing behaviour through the DOM the way a user would.

```tsx
describe('PropertyCard', () => {
  it('shows the formatted price and location', () => {
    render(<PropertyCard property={sampleProperty} />)
    expect(screen.getByText('₦4,500,000')).toBeInTheDocument()
    expect(screen.getByText('Lekki Phase 1, Lagos')).toBeInTheDocument()
  })

  it('renders the cover photo at the card transform', () => {
    render(<PropertyCard property={sampleProperty} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', expect.stringContaining('c_fill,w_640,h_480'))
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<PropertyCard property={sampleProperty} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('truncates a long title rather than overflowing', () => {
    render(<PropertyCard property={{ ...sampleProperty, title: 'A'.repeat(120) }} />)
    expect(screen.getByRole('heading')).toHaveClass('truncate')
  })
})
```

That last test exists because a 120-character property title is real and a broken layout in production is
not a hypothetical.

## 7. E2E tests

Playwright, against a real build with a real database and mocked providers.

| Suite | Flow |
|---|---|
| `auth` | Sign in with OTP, sign out, session expiry, MFA enrol |
| `tenant-payment` | Sign in, view rent due, initiate payment, redirected to a mock Paystack, returned, receipt visible |
| `owner-submission` | Sign in, create a property, upload media, set a cover, submit, see the review state |
| `admin-review` | Sign in with MFA, review a submission, publish it, see it in the list |
| `admin-payout` | Create a run, approve as a second user, initiate, see per-transfer status |
| `admin-permission` | A user without `payout_initiate` cannot see the button; a direct API call is 403 |
| `contract` | Create, approve, activate, pay, terminate, verify the state transitions in the UI |
| `a11y` | axe on every portal route at 360 px and 1440 px |

### 7.1 The payment flow

```ts
test('tenant pays rent and sees a receipt', async ({ page }) => {
  await signInWithOtp(page, TENANT_PHONE, '111111')
  await page.goto('/portal/tenant')

  const payButton = page.getByRole('button', { name: /pay rent/i })
  await expect(payButton).toBeVisible()
  await payButton.click()

  await page.getByRole('checkbox', { name: /october 2026/i }).check()
  await page.getByRole('button', { name: /continue to payment/i }).click()

  // Mock Paystack
  await page.getByRole('button', { name: /pay ₦37,500/i }).click()
  await page.waitForURL(/\/portal\/payments\/return/)

  // The webhook is simulated by the test hitting the webhook endpoint
  await page.request.post('/v1/integrations/paystack/webhook', { data: CHARGE_SUCCESS_FIXTURE, headers: SIGNED })

  await expect(page.getByText(/payment received/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: /download receipt/i })).toBeVisible()
})
```

The test signs the webhook itself. That exercises the real signature verification and the real
`on conflict do nothing` idempotency path, rather than stubbing the settlement.

### 7.2 E2E rules

| Rule | Reason |
|---|---|
| Select by role or accessible name, never by class | A test coupled to a class name breaks on a cosmetic change |
| No `waitForTimeout` | Use `expect(...).toBeVisible()` which retries. A fixed sleep is a flaky test |
| Each test signs in fresh | Shared state between tests is a test that passes alone and fails in a suite |
| Provider calls are mocked at the network layer | Real Paystack in a test suite is slow, costs money, and is rate limited |
| The database is reset per test | Via a global setup that runs migrations and seeds |
| No test asserts only on absence of an error | Assert the actual outcome |

## 8. Contract tests

### 8.1 OpenAPI drift

```ts
// apps/api/test/contract/openapi.test.ts
it('the committed OpenAPI document matches the routes', async () => {
  const generated = await buildOpenApiDocument()
  const committed = JSON.parse(await readFile('../../docs/openapi/courtland.json', 'utf8'))
  expect(normalise(generated)).toEqual(normalise(committed))
})
```

The document is generated from the Zod schemas, so drift means a schema changed without the doc being
regenerated. The doc is also the input to the client type generation, so drift means clients are compiling
against a stale contract.

### 8.2 Schema validation tests

Every Zod schema is tested against a fixture that must pass and a fixture that must fail. A schema with no
failing fixture is not testing that it rejects anything.

### 8.3 Template tests

Every notification template and every PDF template renders with a fixture payload. A template referencing a
variable the code does not send fails here, not in production when a customer sees `Hello , your rent of
₦ is due`.

## 9. Performance tests

| Test | Tool | Budget | Fails when |
|---|---|---|---|
| Lighthouse | `lighthouse-ci` | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 | Any budget exceeded on any key route |
| Bundle size | `size-limit` | As in the design system doc | Exceeded |
| API p95 | `autocannon` in a nightly job | 300 ms on list, 800 ms on a payment intent | Exceeded |
| Query performance | pgTAP with `EXPLAIN` | No sequential scan on a filtered list query | The plan changes |
| Database size | A nightly report | Under 10 GB | Exceeded |

Performance tests run in CI for correctness budgets and nightly for the load ones, because load tests in a
PR pipeline are slow and flaky.

## 10. CI pipeline

```
lint          biome + eslint + tsc          ~40 s
unit          vitest                        ~30 s
integration   vitest + postgres              ~90 s
database      pgTAP                         ~60 s
contract      openapi drift                 ~10 s
coverage      vitest --coverage             ~30 s
build         turbo build                   ~120 s
e2e           playwright                    ~180 s
lighthouse    lighthouse-ci                  ~90 s
security      audit + gitleaks + bundle scan ~60 s
────────────────────────────────────────────────
total                                          ~12 min
```

Parallelised into three jobs — `test-unit`, `test-integration`, `test-e2e` — so wall-clock is about 6
minutes.

## 11. Coverage of the critical paths

The paths where a bug costs money or a customer. These are the ones that get the most attention.

| Path | Unit | Integration | E2E |
|---|---|---|---|
| Rent split into instalments | Property-based, 12 months | Full contract creation | Tenant pays, amount verified |
| Payment intent creation | Amount parsing | 403, idempotency, replay | Full Paystack round trip |
| Webhook settlement | — | Signature, duplicate, amount mismatch, orphan | Signed webhook in the payment test |
| Allocation computation | Every combination of rent, deposit, sale | Sum equals net invariant | Receipt shows the breakdown |
| Refund | Cumulative check | Over-refund rejected | Refund in the admin suite |
| Payout run | Eligibility filter | Dual control, transfer failure | Two users approve and initiate |
| RLS on money tables | — | pgTAP deny for every role | Direct API call 403 |
| Schedule regeneration | All fields | Paid schedule is locked | Not in E2E; covered by integration |
| Escalation cap | Rent Control limit | Rejection above 10% | — |

## 12. Known gaps in coverage

| Gap | Why | Plan |
|---|---|---|
| No load test above 100 rps | The expected peak is 20 rps | Load test in Phase 16 before the marketing push |
| No test of Paystack's actual sandbox | Recorded fixtures only | Manual sandbox verification before launch, once |
| No test of SMS delivery on a real carrier | Mock provider only | Manual verification with each provider during setup |
| No cross-browser E2E on Safari | Playwright runs Chromium and Firefox | Add WebKit in Phase 16. It is the Safari engine and iOS matters here |
| No E2E for the 360 viewer | Heavy WebGL in CI is flaky | Unit test the viewer wrapper; manual check |

Each is a decision, not an oversight. A gap in the test plan is a risk someone has accepted, and writing it
down is what makes it acceptable.

## 13. Dead-code rules

| Rule | Enforcement |
|---|---|
| No test for a file that does not exist | A test importing a missing module fails to compile, which is the correct failure |
| No skipped test | `.skip` without a comment referencing a tracked issue fails a lint rule |
| No `it.only` | Fails the build outright. `only` in a suite is how a broken change ships |
| No assertion-free test | A test with no `expect` fails a lint rule. It is a smoke test that asserts nothing |
| No snapshot-only test | A test whose only assertion is a snapshot fails a lint rule; snapshots are reviewed, and an unreviewed snapshot is not a test |
| No untested exported function in a package | Coverage threshold per package |
| Coverage cannot decrease | A diff check fails the build if total coverage drops |

## 14. Related documents

- API behaviour: [`08-api-design.md`](./08-api-design.md)
- Money invariants: [`04-domain-model.md`](./04-domain-model.md)
- Payments: [`10-payments-paystack.md`](./10-payments-paystack.md)
- Jobs: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- CI pipeline: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
