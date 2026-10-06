# ADR 0014: Vercel for the frontends, Render for the API and workers

- Status: Accepted
- Date: 2026-02-16
- Deciders: Founder, CTO

## Context

Courtland needs three deployment targets: the Next.js app, the Vite admin app, and the Express API with a
worker. Users are in Lagos. The API handles long-running jobs, streaming nothing, and holding database
connections.

The choice of hosts determines latency for Nigerian users, whether long-running work is possible, and the
operational burden.

## Decision

| Target | Host | Region | Rationale |
|---|---|---|---|
| `apps/web` (Next.js) | Vercel | **Cape Town** (`cdg1`) | Nearest Vercel region to Lagos. Immutable builds with an alias swap, so no partial deploys |
| `apps/admin` (Vite) | Vercel | **Cape Town** | Same |
| `apps/api` | Render web service, 2 instances | Oregon | Long-running work, persistent Node process, easy background services |
| `apps/api` worker | Render background worker | Oregon | The Inngest server and the cron poller |
| Postgres and Auth | Supabase, as per ADR 0015 | Oregon | |

**Vercel region is Cape Town, not Washington.** A user in Lagos reaching a server in Virginia pays roughly
120 ms of latency per request before any work happens. Cape Town is around 20 ms. On a mobile network that
is the difference between instant and broken.

The frontends are static or server-rendered and need no persistent process, which is exactly Vercel's
strength. The API holds database connections and runs background work, which is exactly where a
connection-per-request platform becomes awkward.

## Alternatives considered

**Everything on Render.** Rejected. Render can serve the Next.js app, but Vercel's edge network and ISR are
better for the public site, and Vercel's preview deployments per pull request are better than Render's. More
importantly, the public site is the SEO surface and it should be on the platform that is best at it.

**Everything on Vercel.** Rejected. Vercel functions hold database connections, which the platform actively
discourages: connection counts and function lifetime make a pool unsafe. Long-running PDF generation and
reconciliation are also a poor fit for a request-response function model, even with the Fluid compute
options.

**Fly.io for the API.** Viable and arguably better for a regional deployment near Lagos, at the cost of
operating a platform. With two instances and a worker, Render's managed services are the smaller operational
surface for a three-person team.

**AWS, ECS or App Runner, with CloudFront and RDS.** The most capable answer and the wrong one here. It
offers Nigeria-region compute through a partner, real multi-AZ, and RDS with read replicas, at the cost of
infrastructure-as-code, a larger bill, and an on-call burden the team cannot carry. Revisit if the business
needs multi-region or compliance certification that managed platforms cannot provide.

**Self-hosted on a VPS with Docker Compose.** Rejected. One server is one point of failure, TLS renewal and
security patching become manual, and there is no zero-downtime deploy without extra machinery.

**Fly.io or Render for the frontends, with a CDN in front.** Unnecessary. Vercel's network already includes
the CDN, and adding one introduces a cache-invalidation problem for no gain.

## Consequences

**Easier.** Zero-downtime deploys on both platforms, with no server to patch. Preview deployments per pull
request on Vercel. Postgres pooling handled by Supabase's connection pooler, so API instances are stateless.
Scaling is two knobs: Vercel handles traffic spikes, Render's autoscaling handles sustained load.

**Harder.** Two platforms means two deployment configurations and two sets of environment variables to keep in
sync, which is why ADR-adjacent parity is a CI check. Logs are split across two platforms and a third for
Supabase, so Sentry is the correlation point. Vercel's region choice is a latency decision that needs
revisiting as Vercel's region list changes. Render instances have ephemeral disks, so nothing is written to
local storage.

**Cost.** Two platform bills. Vercel bandwidth for the public site. Render for always-on instances, which do
not scale to zero. This is the main reason the public site is on Vercel and the API is not: an API that must
be warm for webhooks and cron cannot be serverless cheaply.

## Revisit when

- Latency from Lagos to the API exceeds a material share of the response budget. Check: p95 latency broken
  down by region, with Nigeria traffic above 30%.
- Render's cost exceeds Vercel's cost for the equivalent load. Check: monthly invoices.
- The business needs multi-region writes, a compliance certification requiring customer-managed keys, or
  dedicated networking. Check: a procurement requirement.

The likely migration path, if the team grows, is containers on Fly.io or AWS with the frontends staying on
Vercel. The API's statelessness, which comes from Supabase's pooler, is what makes that cheap.

## Related

- [`../23-ci-cd-and-deployment.md`](../23-ci-cd-and-deployment.md)
- [`../01-architecture.md`](../01-architecture.md)
- ADR 0003, why two frontend frameworks on one host
- ADR 0015, Supabase hosting
