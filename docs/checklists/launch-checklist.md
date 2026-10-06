# Launch checklist

Everything that must be true before Courtland takes a real tenant's money and a real landlord's property.
Ordered by dependency, not by convenience. Nothing is marked done optimistically.

## 1. Blocking gates

No launch without all eight.

| Gate | Criterion | Evidence |
|---|---|---|
| G1 | Every phase 0–17 exit criterion is met | The roadmap, checked off |
| G2 | CI is green on `main`, all checks required | The pipeline |
| G3 | No dead code: `knip`, `depcheck`, and every verify script pass | CI output |
| G4 | A Nigerian property lawyer has reviewed every template and policy | A dated sign-off |
| G5 | The reconciliation and invariant queries return zero on staging, for 14 consecutive nights | The report |
| G6 | Paystack live keys are configured and a live ₦1 transaction succeeded end to end | A receipt |
| G7 | SMS delivery confirmed on at least two carriers | DLR records |
| G8 | A rollback drill and a PITR restore drill have been performed | The drill reports |

## 2. Legal and compliance

| # | Item | Owner | Status |
|---:|---|---|---|
| 2.1 | Terms of service drafted and reviewed | Legal | ☐ |
| 2.2 | Privacy policy drafted, processors named, safeguards described | Legal | ☐ |
| 2.3 | Cookie notice | Legal | ☐ |
| 2.4 | Listing policy | Product, Legal | ☐ |
| 2.5 | Landlord agreement | Legal | ☐ |
| 2.6 | Tenant rights notice, plain language | Legal | ☐ |
| 2.7 | Tenancy agreement template reviewed | Legal | ☐ |
| 2.8 | Sale agreement template reviewed | Legal | ☐ |
| 2.9 | Notice to vacate reviewed, per state | Legal | ☐ |
| 2.10 | Receipt, statement, and payout advice reviewed | Legal | ☐ |
| 2.11 | The platform's role is stated in every template | Legal | ☐ |
| 2.12 | Data Protection Impact Assessment completed | CTO | ☐ |
| 2.13 | Data Protection Commission notification determination made | Legal | ☐ |
| 2.14 | AML/CFT registration determination made | Legal | ☐ |
| 2.15 | Sanctions screening lists confirmed | Compliance | ☐ |
| 2.16 | Tax advice received on fees, VAT, and withholding | Finance | ☐ |
| 2.17 | Data subject rights procedure written | Compliance | ☐ |
| 2.18 | Breach notification procedure written and the threshold confirmed | CTO | ☐ |
| 2.19 | Data processor agreements in place, with transfer safeguards | Legal | ☐ |
| 2.20 | Company registration details current and on every document | Company secretary | ☐ |
| 2.21 | Insurance: professional indemnity and cyber | Finance | ☐ |
| 2.22 | Every `**[confirm]**` marker in the compliance doc resolved | Legal | ☐ |

## 3. Security

| # | Item | Status |
|---:|---|---|
| 3.1 | Every secret rotated from staging to production values | ☐ |
| 3.2 | No secret in git history. `gitleaks` over the full history is clean | ☐ |
| 3.3 | No secret in any built bundle. The scan is clean | ☐ |
| 3.4 | Production keys are `sk_live_` and `pk_live_`; test keys are nowhere in production | ☐ |
| 3.5 | `SMS_PROVIDER` is not `mock` in production. The schema enforces it | ☐ |
| 3.6 | RLS enabled on every table in `public`. The test passes | ☐ |
| 3.7 | Every grant has a matching policy. The test passes | ☐ |
| 3.8 | `adminDb` imports confined to `db/`, `jobs/`, `bin/`, and the allowlist | ☐ |
| 3.9 | Every `security definer` function reviewed, with an empty search path | ☐ |
| 3.10 | MFA enrolment confirmed working for every admin | ☐ |
| 3.11 | `session_version` revocation tested | ☐ |
| 3.12 | CSP active on both apps, nonce-based | ☐ |
| 3.13 | CORS allowlist exact, no wildcards | ☐ |
| 3.14 | Rate limits verified on every listed endpoint class | ☐ |
| 3.15 | OWASP ZAP baseline scan clean against staging | ☐ |
| 3.16 | Dependency audit: no critical, no high without a dated mitigation | ☐ |
| 3.17 | `audit_log` writing for every privileged action in the audit table | ☐ |
| 3.18 | Audit log export to cold storage scheduled | ☐ |
| 3.19 | Admin session timeout is 8 hours and verified | ☐ |
| 3.20 | Offboarding procedure tested on a test account | ☐ |
| 3.21 | Every staff member has signed the acceptable-use policy | ☐ |
| 3.22 | Admin access restricted to company-managed devices | ☐ |
| 3.23 | Known gaps in the security doc accepted by the CTO in writing | ☐ |

## 4. Payments

| # | Item | Status |
|---:|---|---|
| 4.1 | Paystack business account verified, live mode enabled | ☐ |
| 4.2 | Live keys in the production environment | ☐ |
| 4.3 | Webhook URL registered, signature secret rotated to the production value | ☐ |
| 4.4 | The webhook has fired in production and settled correctly | ☐ |
| 4.5 | A live ₦1 payment completed end to end, with a receipt | ☐ |
| 4.6 | Subaccount creation tested with a real owner account | ☐ |
| 4.7 | Split codes and percentage handling verified against the live dashboard | ☐ |
| 4.8 | The management fee reconciles with what Paystack shows | ☐ |
| 4.9 | Refund tested against a live transaction | ☐ |
| 4.10 | A live transfer tested: created, settled, and reconciled | ☐ |
| 4.11 | The payout lag is set to 3 business days | ☐ |
| 4.12 | The minimum payout is set and verified | ☐ |
| 4.13 | Dual control on payouts tested with two accounts | ☐ |
| 4.14 | Reconciliation has run clean for 14 consecutive nights on staging | ☐ |
| 4.15 | The ledger invariant queries return zero | ☐ |
| 4.16 | The synthetic smoke payment works in production | ☐ |
| 4.17 | The refund policy is documented for support | ☐ |
| 4.18 | The reconciliation variance runbook has been read by the finance lead | ☐ |
| 4.19 | Paystack support contact established, with the merchant ID on hand | ☐ |
| 4.20 | The payout halt procedure tested | ☐ |

## 5. Infrastructure

| # | Item | Status |
|---:|---|---|
| 5.1 | Production Supabase project created, region chosen, PITR verified | ☐ |
| 5.2 | `supabase start` never used against production | ☐ |
| 5.3 | Migrations applied to production from CI, not by hand | ☐ |
| 5.4 | Render production services created, `autoDeploy: false` | ☐ |
| 5.5 | Two API instances, health check passing, autoscaling configured | ☐ |
| 5.6 | Worker running, functions registered | ☐ |
| 5.7 | Cron service running and firing | ☐ |
| 5.8 | Vercel production projects configured with the Lagos region | ☐ |
| 5.9 | Custom domains: `courtland.com.ng`, `admin.courtland.com.ng` | ☐ |
| 5.10 | SSL certificates issued and auto-renewing | ☐ |
| 5.11 | `TZ=Africa/Lagos` set on every service that computes dates | ☐ |
| 5.12 | Cloudinary production account with the named transformations created | ☐ |
| 5.13 | Cloudinary storage and bandwidth at a safe level of the plan | ☐ |
| 5.14 | Resend domain verified, SPF, DKIM, and DMARC published | ☐ |
| 5.15 | DMARC at `p=quarantine` with a reporting address, moving to `p=reject` after a week | ☐ |
| 5.16 | Inngest production branch created, signing key rotated | ☐ |
| 5.17 | Redis provisioned for rate limits and auth caching | ☐ |
| 5.18 | Sentry production project, DSN set, release tracking on | ☐ |
| 5.19 | PagerDuty service created and the on-call schedule set | ☐ |
| 5.20 | PITR restore drill performed to a branch | ☐ |
| 5.21 | Rollback drill performed | ☐ |
| 5.22 | Backups for Render configuration and the Supabase project settings exported | ☐ |
| 5.23 | Monitoring and alerting verified in production, not only staging | ☐ |
| 5.24 | Every alert's runbook link resolves | ☐ |

## 6. SMS

| # | Item | Status |
|---:|---|---|
| 6.1 | At least two SMS providers contracted | ☐ |
| 6.2 | Alphanumeric sender ID `Courtland` registered and confirmed on each | ☐ |
| 6.3 | Sender ID approval confirmed in writing, not pending | ☐ |
| 6.4 | A test message delivered to a handset on Airtel | ☐ |
| 6.5 | A test message delivered to a handset on MTN | ☐ |
| 6.6 | A test message delivered to a handset on Glo | ☐ |
| 6.7 | A test message delivered to a feature phone | ☐ |
| 6.8 | DLR callbacks wired and recorded | ☐ |
| 6.9 | The fallback chain verified by failing the primary | ☐ |
| 6.10 | The Supabase Send SMS hook pointed at the production API | ☐ |
| 6.11 | `SMS_HOOK_SECRET` rotated to the production value | ☐ |
| 6.12 | OTP delivery confirmed end to end in production | ☐ |
| 6.13 | WhatsApp opt-in tested, if enabled | ☐ |
| 6.14 | The message templates reviewed by legal | ☐ |

## 7. Product readiness

| # | Item | Status |
|---:|---|---|
| 7.1 | Public site: home, about, how it works, FAQ, contact | ☐ |
| 7.2 | Listing search works with every filter and facet count | ☐ |
| 7.3 | Listing detail: gallery, video, 360 if enabled, map, similar | ☐ |
| 7.4 | Tenant portal: overview, payments, contracts, maintenance, notices, statements | ☐ |
| 7.5 | Owner portal: properties, submission flow, contracts, finance, KYC, tenants | ☐ |
| 7.6 | Buyer portal: saved searches, purchases, payments, notices | ☐ |
| 7.7 | Admin: dashboard, properties, submissions, owners, KYC, contracts, payments, payouts, maintenance, documents, notices, disputes, audit, users | ☐ |
| 7.8 | Onboarding works from a real phone on a real network | ☐ |
| 7.9 | A complete tenancy: list, apply, agree, sign, pay, receipt, terminate | ☐ |
| 7.10 | A complete sale: list, deposit, instalment, closing, receipt | ☐ |
| 7.11 | A payout cycle: run, approve, initiate, settle, advice | ☐ |
| 7.12 | A maintenance ticket from raise to resolve to charge to payment | ☐ |
| 7.13 | A dispute from file to resolve | ☐ |
| 7.14 | Error states are written in plain language, not raw error codes | ☐ |
| 7.15 | Loading states on every async view | ☐ |
| 7.16 | Empty states on every collection | ☐ |
| 7.17 | Offline behaviour: queued mutations and a pending banner | ☐ |
| 7.18 | Every form validates before submitting and maps server errors to fields | ☐ |
| 7.19 | Money displays as ₦ with separators everywhere | ☐ |

## 8. Quality

| # | Item | Status |
|---:|---|---|
| 8.1 | Every E2E flow passes in CI | ☐ |
| 8.2 | Coverage thresholds met, no regression | ☐ |
| 8.3 | Lighthouse budgets pass on every key route | ☐ |
| 8.4 | Bundle size budgets pass | ☐ |
| 8.5 | axe clean on every portal and admin route | ☐ |
| 8.6 | Keyboard navigation through a complete flow | ☐ |
| 8.7 | Tested on real Android and iOS devices, not only emulators | ☐ |
| 8.8 | Tested on a 3G connection profile | ☐ |
| 8.9 | Tested with a mid-range Android, the most likely device | ☐ |
| 8.10 | `knip`, `depcheck`, `jscpd` clean | ☐ |
| 8.11 | Every verify script passes | ☐ |
| 8.12 | Docs link check clean | ☐ |
| 8.13 | No `TODO` or `FIXME` anywhere | ☐ |
| 8.14 | No skipped or `only` tests | ☐ |
| 8.15 | Every Playwright test passes three consecutive runs, with no retries | ☐ |

## 9. Data

| # | Item | Status |
|---:|---|---|
| 9.1 | Reference data seeded: states, LGAs, property types, amenities, templates | ☐ |
| 9.2 | No test accounts or test contracts in production | ☐ |
| 9.3 | Seed script verified to create no user accounts | ☐ |
| 9.4 | Retention policies configured on every table with a retention rule | ☐ |
| 9.5 | The purge jobs for audit, webhook events, and outbox are scheduled | ☐ |
| 9.6 | Every document template has a fixture render | ☐ |
| 9.7 | Every notification template has a fixture render | ☐ |
| 9.8 | Database backup verified by restore, not by the presence of a backup | ☐ |
| 9.9 | Data export for a data subject tested end to end | ☐ |
| 9.10 | Erasure tested: the profile is anonymised, the financial records are retained | ☐ |
| 9.11 | Data deletion from Cloudinary and the SMS provider on erasure, where required | ☐ |

## 10. People

| # | Item | Status |
|---:|---|---|
| 10.1 | On-call rotation staffed, including out of hours | ☐ |
| 10.2 | Every runbook read by the person who will run it | ☐ |
| 10.3 | Incident severity definitions agreed | ☐ |
| 10.4 | PagerDuty escalation tested with a real page | ☐ |
| 10.5 | Support team trained on the top twenty support issues | ☐ |
| 10.6 | Finance trained on reconciliation and the variance runbook | ☐ |
| 10.7 | A support email, a phone number, and a published response time | ☐ |
| 10.8 | Status page configured, or an agreed manual process | ☐ |
| 10.9 | Onboarding documents for the first three staff | ☐ |
| 10.10 | The first staff admin accounts created with the minimum permissions | ☐ |

## 11. Business

| # | Item | Status |
|---:|---|---|
| 11.1 | Pricing decided and implemented | ☐ |
| 11.2 | The management fee percentage decided and validated against the 10% cap | ☐ |
| 11.3 | Service charge decided | ☐ |
| 11.4 | Bank account details for Courtland's own receipts confirmed | ☐ |
| 11.5 | Invoicing for landlords on the platform prepared | ☐ |
| 11.6 | Insurance in place | ☐ |
| 11.7 | Terms agreed with the first three anchor landlords | ☐ |
| 11.8 | A support and escalation contact named for each anchor landlord | ☐ |
| 11.9 | The launch date set, with a two-week soft launch first | ☐ |
| 11.10 | Rollback criteria defined: what would cause a pause | ☐ |

## 12. Soft launch

Two weeks with a handful of real landlords and tenants before opening fully.

| # | Day | Item | Status |
|---:|---|---|---|
| 12.1 | 1 | Five anchor landlords onboarded, properties listed | ☐ |
| 12.2 | 1–3 | Every listed property reviewed and published | ☐ |
| 12.3 | 3 | First real tenancy agreed, signed, and paid | ☐ |
| 12.4 | 3–5 | First payout cycle run, approved, transferred, reconciled | ☐ |
| 12.5 | 5 | First maintenance ticket through to resolution | ☐ |
| 12.6 | 7 | First refund tested on a real transaction, with the landlord's consent | ☐ |
| 12.7 | 7 | First termination tested, notice served, deposit settled | ☐ |
| 12.8 | 10 | Reconciliation run manually and reconciled against Paystack by a human | ☐ |
| 12.9 | 14 | Landlord and tenant interviews completed | ☐ |
| 12.10 | 14 | Go or no-go decision recorded with the reasons | ☐ |

## 13. Sign-off

Nobody signs for their own area.

| Role | Name | Date | Signature |
|---|---|---|---|
| Founder | | | |
| CTO | | | |
| Lead developer | | | |
| Compliance lead | | | |
| Finance lead | | | |
| Nigerian property lawyer | | | |
| Support lead | | | |

## 14. Related documents

- Phase exit criteria: [`../roadmap.md`](../roadmap.md)
- Definition of done: [`definition-of-done.md`](./definition-of-done.md)
- Compliance register: [`../25-nigeria-compliance.md § Compliance register`](../25-nigeria-compliance.md#11-compliance-register)
- Runbooks: [`../24-operations-runbooks.md`](../24-operations-runbooks.md)
