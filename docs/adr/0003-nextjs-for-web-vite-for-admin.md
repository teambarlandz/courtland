# ADR 0003: Next.js for the public site and portals, Vite for the admin

- Status: Accepted
- Date: 2026-02-11
- Deciders: Founder, Lead developer

## Context

Courtland has two frontend shapes:

1. A **public site and search**, which needs server rendering for SEO and a fast first paint for users on
   slow Nigerian mobile connections.
2. Three **portals** and an **admin panel**, which are highly interactive authenticated applications where
   SEO is irrelevant and where a client-side application shell is fine.

Choosing one framework for both means accepting a bad trade in one of them. Choosing two means two build
systems and, if not careful, two component trees.

## Decision

| Surface | Framework | Hosting | Why |
|---|---|---|---|
| Public site, search, three portals | Next.js 16 App Router, React 19 | Vercel | SSR and ISR for the indexable pages; Server Components for the data-heavy read paths |
| Admin | Vite 7, React 19 | Vercel | No SEO need, so no reason to run a server; faster builds and a simpler mental model |

Both import the same `packages/ui`, the same `packages/api-client`, and the same `packages/utils`. One design
system, one typed client, one money formatter. The only duplicated code is the auth provider, which differs
legitimately: the portal uses cookies from `@supabase/ssr`, the admin uses a token from a SPA session.

## Alternatives considered

**Next.js for everything, including the admin.** Rejected. Refine's router integration targets
`react-router`, not the App Router, so the admin would either use `react-router` inside Next, which is awkward,
or forgo Refine's routing, which loses most of its value. Building the admin on Next would mean giving up
Refine to avoid a second build system, which is a bad trade.

**Vite for everything, with a separate static marketing site.** Rejected. Two deployments, two dependency
trees, and the marketing site is where SEO matters most, which is where a shared React Server Component tree
helps most.

**A single SPA with client-side routing for the portals too.** Rejected. The portal overview would need a
loading state on every visit, because the data comes from an authenticated API call. The owner portal shows
properties, income, arrears, and open tickets; a loading spinner for all of it on every navigation is a worse
experience than a server render, especially on a 3G connection.

**Astro for the marketing site.** Rejected. Three frameworks in one repository for a small team is
operational overhead without a matching benefit. The marketing site is a small part of the product.

## Consequences

**Easier.** One design system across both. One typed API client. Server Components mean the portal's initial
paint does not wait on JavaScript. The listing page is fast and indexable without separate SEO work.

**Harder.** Two build systems to maintain. Shared components must be free of framework-specific imports, so
anything needing a Next server primitive is duplicated. `next/font` and Vite's font handling differ. Two
deployment configurations. Two sets of bundle budgets.

**Cost.** Roughly one extra day per quarter maintaining both build setups. A component needing something
framework-specific is written twice. The admin's bundle budget is looser because Refine is larger.

## Revisit when

- Refine ships a first-party App Router adapter of production quality. Check: `@refinedev/nextjs-router` at a
  stable version, used in production elsewhere.
- The admin needs SSR for a specific reason. Check: an SEO requirement on an authenticated page, which would
  be unusual.
- Bundle duplication between the two apps exceeds about 30 KB gzipped of the same code. Check: `size-limit`
  reporting shared dependencies counted twice.

If Refine gains a stable Next adapter, revisit this before anything else. The two-app split is the main cost.

## Related

- [`../16-frontend-web.md`](../16-frontend-web.md)
- [`../17-frontend-admin.md`](../17-frontend-admin.md)
- ADR 0004, Refine for the admin
- ADR 0005, the shared design system
- ADR 0014, hosting
