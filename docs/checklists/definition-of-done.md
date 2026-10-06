# Definition of Done

What has to be true before a piece of work is finished. Not a guideline; the check that CI runs and a
reviewer runs.

## 1. Universal criteria

Every change, every phase, every pull request.

| # | Criterion | How it is checked |
|---:|---|---|
| 1 | It works | Tests pass. The specific behaviour has a test that fails without the change |
| 2 | Types are sound | `pnpm typecheck` clean, no `any`, no `@ts-ignore` without a reason comment |
| 3 | Linted and formatted | `pnpm lint` and `pnpm format:check` clean |
| 4 | Nothing unused | `pnpm knip` reports nothing |
| 5 | Nothing duplicated | `pnpm jscpd` under threshold |
| 6 | No dead code | Every new export, component, route, job, template, and flag has a consumer |
| 7 | No dangling reference | Docs links, imports, and API references all resolve |
| 8 | Error paths handled | Every failure has a typed error and a user-visible message |
| 9 | Loading, empty, and error states | For every async view |
| 10 | Accessible | Keyboard operable, labelled, AA contrast, axe clean |
| 11 | Mobile works | Verified at 360 px |
| 12 | No hard-coded secrets | `gitleaks` clean, no key literals |
| 13 | No secrets in the bundle | The build-time scan is clean |
| 14 | Database changes are additive | No destructive migration in the same release |
| 15 | Documented | The relevant doc updated, and the link checker passes |
| 16 | Reviewed | One approval; two for anything touching money, auth, or RLS |

## 2. New endpoint

| # | Criterion |
|---:|---|
| 1 | Zod schema for body, query, and params, with `.strict()` on the body |
| 2 | `requirePermission` with a permission from the matrix, or explicitly documented as public |
| 3 | The permission has a row in `role_permissions` |
| 4 | Every filter and sort column whitelisted and indexed |
| 5 | Cursor pagination if it returns a collection |
| 6 | `Idempotency-Key` supported if unsafe; required if it moves money or changes legal state |
| 7 | Typed errors from the catalogue, not ad-hoc strings |
| 8 | `problem+json` shape verified by a test |
| 9 | An integration test for the happy path, a 403, a 404, and a 422 |
| 10 | In the OpenAPI document, and the committed file regenerated |
| 11 | Registered in `routeRegistry` if a Refine resource uses it |
| 12 | Covered by at least one frontend caller, or documented as a webhook or cron endpoint |

## 3. New database table

| # | Criterion |
|---:|---|
| 1 | Migration with a `-- Down:` comment |
| 2 | `uuid` primary key with `gen_random_uuid()` |
| 3 | `created_at` and `updated_at`, both `timestamptz` |
| 4 | Money columns named `*_kobo` and typed `bigint` |
| 5 | Foreign keys with an explicit `on delete` behaviour |
| 6 | Indexes for every column used in an RLS predicate |
| 7 | RLS enabled |
| 8 | A policy per operation, `to` specified, `using` and `with check` where applicable |
| 9 | A pgTAP test asserting an allow and a deny, for each role that could try |
| 10 | Grants revoked from `anon` and `authenticated`, granted back only what is needed |
| 11 | Added to the `rls_enabled` and `grants` test queries |
| 12 | Added to the policy summary table in the authorization doc |
| 13 | Any `security definer` function reviewed, with `set search_path = ''` |
| 14 | Any trigger has its own test |

## 4. New RLS policy

Two reviewers. No exceptions.

| # | Criterion |
|---:|---|
| 1 | Denies by default: enabling RLS with no policy denies everything |
| 2 | `to` is specified |
| 3 | `(select auth.uid())`, not a bare `auth.uid()` |
| 4 | Reads through `private.*` helpers, not inline subqueries against other RLS tables |
| 5 | No recursion. If a cycle is needed, `security definer` with an empty search path |
| 6 | Every column in a predicate is indexed, leading |
| 7 | `with check` on insert and update |
| 8 | A test that a role that should be allowed is allowed |
| 9 | A test that a role that should be denied is denied |
| 10 | The same test through the API, asserting 200 or 403 |
| 11 | Documented in the policy summary table |

## 5. New component

| # | Criterion |
|---:|---|
| 1 | In `packages/ui`, not in an app |
| 2 | No dependency on an app or on the API client |
| 3 | Props typed, no `any` |
| 4 | A Storybook story |
| 5 | Tests for loading, empty, error, disabled |
| 6 | A test with long content, because text overflows in production |
| 7 | axe clean |
| 8 | Keyboard operable, focus visible, focus returned |
| 9 | Colours from tokens, no hex literals |
| 10 | Money through `MoneyDisplay` or `MoneyInput`, never a formatted string |
| 11 | No unused prop |
| 12 | Used by at least one app, or it does not exist |

## 6. New job

| # | Criterion |
|---:|---|
| 1 | Registered in `jobs/index.ts` |
| 2 | Triggered by an event, a cron, or an explicit API call, and `verify:jobs` proves it |
| 3 | If a cron, it is in `render.yaml` and `crons.ts`, and the two match |
| 4 | Idempotent: a duplicate run is harmless |
| 5 | Retries configured, and retryable errors distinguished from permanent ones |
| 6 | Steps declared, so a replay does not re-run completed work |
| 7 | `concurrency` set where overlap is harmful |
| 8 | The `requestId` propagated from the originating request |
| 9 | Metrics emitted: runs, duration, failures |
| 10 | An alert if it can fail silently in a way that matters |
| 11 | Writes to `outbox_events` for external effects, never calls a provider directly |
| 12 | No `setInterval`; Inngest steps instead |
| 13 | A runbook entry if a failure needs human action |

## 7. New notification template

| # | Criterion |
|---:|---|
| 1 | In the catalogue in the notifications doc |
| 2 | A Zod schema for its variables |
| 3 | A fixture test that renders it |
| 4 | A triggering code path, or `verify:templates` fails |
| 5 | A file for every channel it lists |
| 6 | A priority assigned |
| 7 | A dedupe key, if it can repeat |
| 8 | Every variable the code sends is in the schema; every schema variable is sent |
| 9 | No personal data beyond the recipient in SMS |
| 10 | Under 160 characters per segment for SMS |

## 8. New PDF template

| # | Criterion |
|---:|---|
| 1 | Versioned in the filename. A change means a new file, never an edit |
| 2 | Registered in the template directory and the catalogue |
| 3 | A fixture test that renders it and asserts the page count |
| 4 | Every amount through `formatNaira` |
| 5 | Embedded fonts, no linked fonts |
| 6 | Tabular numerals on money columns |
| 7 | A footer with the reference, the timestamp, and the platform's role |
| 8 | The `documents` row records the template and version |
| 9 | `verify-templates` passes: the kind maps to the template and the template is used |

## 9. Money changes

Four reviewers. The strictest bar in the project.

| # | Criterion |
|---:|---|
| 1 | Written as integers. No float, no `numeric`, no string |
| 2 | The total is asserted exactly, in a test |
| 3 | Property-based tests if the input space is large |
| 4 | Allocations sum to `net_kobo`, asserted in pgTAP |
| 5 | No rounding anywhere. Rounding is a documented business decision with a reason |
| 6 | Idempotent. A retry cannot double-apply |
| 7 | `Idempotency-Key` required |
| 8 | Every state change audited |
| 9 | A migration that reconciles against existing rows, with a test |
| 10 | The reconciliation job updated if the data shape changed |
| 11 | No `adminDb` outside the allowed paths |
| 12 | Two approvals, at least one from someone who did not write it |

## 10. Auth changes

Two reviewers.

| # | Criterion |
|---:|---|
| 1 | No password anywhere |
| 2 | No role from `user_metadata` |
| 3 | No privilege change that a client can make to itself |
| 4 | Rate limits reviewed |
| 5 | Enumeration implications assessed |
| 6 | Sessions still HTTP-only |
| 7 | The CSRF position re-checked if headers or cookies changed |
| 8 | Audit coverage for the new action |
| 9 | `audit_read` for anything sensitive |

## 11. Phase exit criteria

A phase is done when all of these are true.

| # | Criterion |
|---:|---|
| 1 | Every file listed for the phase exists |
| 2 | Every file is consumed by something. An unused file is a dead file |
| 3 | Every import in the phase resolves, and nothing imports across a boundary it should not |
| 4 | Tests pass, with the coverage thresholds met |
| 5 | `knip` reports nothing |
| 6 | `depcheck` reports nothing |
| 7 | Every new route, job, template, and flag is verified by a CI check |
| 8 | Migrations applied and pgTAP green |
| 9 | Docs written or updated, and the link checker passes |
| 10 | Deployed to staging and the smoke test passes |
| 11 | No `[TODO]` or `FIXME` left in the code |
| 12 | No feature flag left without a decision |
| 13 | Any known gap is written in the relevant doc's "known gaps" section |
| 14 | The next phase's dependencies are all met |

## 12. Anti-dead-code checklist

The specific rules that keep the repository honest. Each is a CI check.

| Rule | Check |
|---|---|
| No unused file | `knip` |
| No unused export | `knip` |
| No unused dependency | `depcheck` |
| No duplicate code | `jscpd` |
| No unused component | `knip` plus the Storybook index |
| No unused route | Route reachability check |
| No unused API endpoint | Resource coverage check |
| No unused job | `verify:jobs` |
| No unused template | `verify:templates` |
| No unused media transform | `verify:media` |
| No unused permission | Matrix completeness test |
| No unused nav entry | Nav completeness test |
| No unused flag | Flag usage check |
| No unused environment variable | Schema usage check |
| No unused metric | Metric registry check |
| No dangling doc link | Link checker |
| No stale doc reference | Docs freshness check |
| No `adminDb` in a request handler | Lint rule |
| No `security definer` without review | Comment requirement check |
| No migration without a down note | Migration lint |
| No skipped or `only` test | Lint rule |
| No assertion-free test | Lint rule |
| No snapshot-only test | Lint rule |
| No `TODO` or `FIXME` | Grep in CI |
| No code beyond the current phase | Phase boundary check against the roadmap |
| No coverage regression | Diff check |

## 13. Related documents

- Roadmap phases: [`roadmap.md`](../roadmap.md)
- Testing tiers: [`20-testing.md`](../20-testing.md)
- Security: [`19-security.md`](../19-security.md)
- Launch: [`launch-checklist.md`](./launch-checklist.md)
