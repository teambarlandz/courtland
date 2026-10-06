# 16 — Frontend: public site and portals

`apps/web` is one Next.js application serving four surfaces: the public marketing site, the public listing
search, and the three role portals. They share a build and a design system; they differ in layout, data
needs, and access rules.

## 1. Why one Next.js app

| Option | Verdict |
|---|---|
| **One app, route groups** | Chosen. One deployment, one dependency tree, shared components, shared auth handling. The portals are `/portal/*` behind `proxy.ts`. |
| Separate marketing site | Rejected. Two deployments, two bundles of the same components, and the marketing site is where SEO matters most, which is exactly where a shared Next build helps. |
| Next.js for portals | Partially. Server Components fit the marketing site; the portals are highly interactive and mostly client-rendered. |
| SPA (Vite) for the marketing site | Rejected. Loses SSR and image optimisation, which is most of the SEO value. |

## 2. Routes

```
app/
  (marketing)/                 no auth
    page.tsx                   home
    about/page.tsx
    contact/page.tsx
    how-it-works/page.tsx
    faq/page.tsx
    terms/page.tsx
    privacy/page.tsx
  (public)/                    no auth
    properties/
      page.tsx                 search + grid, the indexable one
      loading.tsx
      error.tsx
    properties/[slug]/page.tsx           listing detail, indexable. The segment is the slug,
                                        not the reference: references are sequential and a
                                        sequential public URL leaks listing volume
    properties/[slug]/gallery/page.tsx
    saved-searches/page.tsx               requires auth -> redirects to sign-in
  auth/
    sign-in/page.tsx
    verify/page.tsx
    onboarding/page.tsx
    callback/page.tsx
    forgot/page.tsx
  portal/
    layout.tsx                 auth guard lives here + proxy.ts
    page.tsx                   role router
    tenant/
      layout.tsx
      page.tsx                 overview: rent due, arrears, tickets
      payments/page.tsx
      payments/[id]/page.tsx
      contracts/page.tsx
      contracts/[id]/page.tsx
      contracts/[id]/documents/page.tsx
      maintenance/page.tsx
      maintenance/[id]/page.tsx
      notices/page.tsx
      statements/page.tsx
    owner/
      layout.tsx
      page.tsx                 overview: properties, income, payouts
      properties/page.tsx
      properties/new/page.tsx
      properties/[id]/page.tsx
      properties/[id]/edit/page.tsx
      properties/[id]/units/page.tsx
      properties/[id]/land/page.tsx
      properties/[id]/media/page.tsx
      contracts/page.tsx
      contracts/[id]/page.tsx
      contracts/new/page.tsx
      finance/page.tsx
      finance/payouts/page.tsx
      finance/statements/page.tsx
      payout-accounts/page.tsx
      kyc/page.tsx
      maintenance/page.tsx
      maintenance/[id]/page.tsx
      documents/page.tsx
      notices/page.tsx
      tenants/page.tsx
    buyer/
      layout.tsx
      page.tsx
      saved-searches/page.tsx
      purchases/page.tsx
      purchases/[id]/page.tsx
      payments/page.tsx
      notices/page.tsx
  api/
    auth/[[...path]]/route.ts   proxies to the API where a cookie must be set
  sitemap.ts
  robots.ts
  opengraph-image.tsx
```

### 2.1 Route groups

`(marketing)` and `(public)` share `/` and `/properties`. Route groups let them coexist without a URL
segment, and they get separate layouts. `(marketing)` has the marketing header and footer; `(public)` has
the search header with the filter bar; `portal` has the app shell.

## 3. Rendering strategy

| Route | Strategy | Why |
|---|---|---|
| `/` | Static | Changes on deploy |
| `/properties` | Static shell + client search | Indexable filters in the URL matter for SEO |
| `/properties/[slug]` | ISR, `revalidate: 60` | Indexable, and a price change should appear within a minute |
| `/auth/*` | Dynamic | No caching of auth UI |
| `/portal/tenant/*` | Dynamic, authenticated | Per-user, never cached |
| `/portal/owner/*` | Dynamic, authenticated | Per-user |
| `/portal/buyer/*` | Dynamic, authenticated | Per-user |

```ts
// app/(public)/properties/[slug]/page.tsx
export const revalidate = 60

export async function generateStaticParams() {
  const { data } = await getFeaturedProperties()      // top 100 by views, at build
  return data.map((p) => ({ reference: p.reference }))
}

export default async function ListingPage({ params }: Props) {
  const property = await getPropertyByReference((await params).reference)
  if (!property) notFound()
  return <ListingDetail property={property} />
}
```

The top 100 are prerendered at build; everything else is generated on first request and cached for 60
seconds. Prerendering all listings is impossible at the start (there are none) and unnecessary at scale.

## 4. Auth integration

`@supabase/ssr` with cookie handling. The proxy refreshes the session; the server reads it.

```ts
// lib/supabase/server.ts
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* called from a Server Component; proxy.ts already refreshed it */ }
        },
      },
    },
  )
}
```

The `try/catch` around `setAll` is not sloppiness. A Server Component cannot set cookies, so when the
server client tries, Next throws. The session was already refreshed in `proxy.ts` on that same request, so
the failure is harmless. Swallowing it there, with a comment saying why, is correct.

### 4.1 Route protection

```ts
// app/portal/layout.tsx
export default async function PortalLayout({ children }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/sign-in?next=/portal')

  const profile = await getPortalProfile(user.id)      // server-side, with the service client
  if (!profile.onboardingComplete) redirect('/auth/onboarding')

  return <PortalShell profile={profile}>{children}</PortalShell>
}
```

`proxy.ts` also redirects, and both do. `proxy.ts` gives the fast path a good experience; the layout is
what actually guarantees it, because a layout runs on the server for every request.

### 4.2 Fetching data from the API

Server Components forward the incoming cookie. They do not mint a token: `createClient()` reads the
`@supabase/ssr` cookies off the request, and the header below is what lets the browser's own client-side
calls share one session with the server-rendered ones.

```ts
// lib/api/server.ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies()
  const csrf = cookieStore.get('courtland-csrf')?.value ?? ''

  const res = await fetch(`${env.COURTLAND_API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      // Forwarded verbatim. Never rebuilt from a decoded token: that would let a stale value be
      // upgraded into a fresh-looking session.
      cookie: cookieStore.toString(),
      'x-csrf-token': csrf,
      'x-request-id': headers().get('x-request-id') ?? crypto.randomUUID(),
    },
    // Per-user data must never be cached in a shared cache.
    cache: 'no-store',
  })

  if (!res.ok) throw toProblem(res)
  return res.json()
}
```

Client Components use `credentials: 'include'` and the same CSRF header, because the browser attaches the
cookie itself and the token never has to be read into JavaScript:

```ts
// lib/api/client.ts
const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
  ...init,
  credentials: 'include',
  headers: { ...init?.headers, 'x-csrf-token': readCookie('courtland-csrf') ?? '' },
})
```

`cache: 'no-store'` on anything under `/portal` is a correctness requirement, not a performance choice. A
cached tenant response shared between two users is the worst bug this app could have, and Next's fetch cache
is keyed by URL, not by user.

Public routes use the `anon` key and `next: { revalidate }`.

## 5. Client data layer

`@tanstack/react-query` for portal interactivity; plain server fetches for public pages.

```ts
// lib/query/keys.ts
export const queryKeys = {
  properties: (filters: PropertyFilters) => ['properties', filters] as const,
  property: (reference: string) => ['property', reference] as const,
  myContracts: () => ['contracts', 'mine'] as const,
  contract: (id: string) => ['contract', id] as const,
  myPayments: (cursor?: string) => ['payments', 'mine', cursor] as const,
  myNotices: (cursor?: string) => ['notices', cursor] as const,
  myProperties: () => ['properties', 'mine'] as const,
  myPayouts: () => ['payouts', 'mine'] as const,
  facets: (filters: PropertyFilters) => ['properties', 'facets', filters] as const,
}
```

| Decision | Rule |
|---|---|
| Query keys are hierarchical | `['contract', id]` invalidates with `['contract']` |
| Filters go in the key | Same filters, same cache; different filters, different entry |
| `staleTime` 30 s for portal data | Rent status does not change by the second, and a portal refetch on every navigation is wasteful on a 3G connection |
| `staleTime` 5 min for public search | Listings change slowly; the grid is not a live feed |
| Invalidation on mutation | Every mutation invalidates exactly the keys it affects, written next to the mutation |
| No global state library | TanStack Query's cache is the server state. The only client state that matters is filter and form state, which is local |

No Redux, no Zustand. A store that duplicates the query cache is a store that will disagree with it.

## 6. Listing search

The most-used screen in the product.

### 6.1 URL as state

```
/properties?state=Lagos&type=flat&beds=3&rentMax=4500000&sort=-createdAt&page=2
```

| Concern | Implementation |
|---|---|
| Filters in the URL | Shareable, bookmarkable, back-button-correct |
| Server Component shell | Reads `searchParams`, renders the header, filter bar, and grid |
| Client grid | Facet counts from `GET /v1/properties/facets`, filter chips, infinite scroll |
| Debounce | 300 ms on text and price inputs, immediate on selects |
| URL updates | `router.replace` with `scroll: false`, so typing does not scroll the page |

### 6.2 Mobile

On mobile the filters live in a bottom sheet, opened by a "Filters" button showing the active count as a
badge. The sheet is a `Drawer` from the design system, drag-to-dismiss, with "Show N properties" as a sticky
footer. The sheet and the desktop sidebar share one `FilterPanel` component with a `variant` prop, so the
two cannot drift apart in behaviour.

### 6.3 Map

A toggle between grid and map. The map is `react-leaflet` with OpenStreetMap tiles, loaded lazily and only
when the user asks for it, because a map library is 150 KB and most users on a phone never open it.

Markers are clustered at low zoom with `react-leaflet-cluster`. Clicking a marker opens a card with the cover
photo, price, and a link to the listing. The map's bounds update the filter, which updates the results in the
grid, so switching between views keeps the same result set.

Tiles come from OpenStreetMap, whose tile usage policy requires a valid `User-Agent` and `Referer`, and
limits heavy use. That is a Phase 15 decision to revisit: at scale the tiles move to a commercial provider,
configured by one environment variable.

## 7. Property detail

| Section | Content |
|---|---|
| Gallery | Hero, thumbnail strip, lightbox, video, 360 tour |
| Summary | Title, price, location, property type, bedrooms, bathrooms, area |
| Description | Rich text from the owner, sanitised |
| Features | Amenities as chips |
| Location | Address, area, map with a single marker |
| Landlord | Name, agency, response time, other listings |
| Payment terms | Rent or price, period, deposit, escalation cap |
| CTA | Enquire, save, share |
| Similar | Same type, same area, within 20% of the price |

Enquiry opens a form that creates a `lead`. The lead goes to the owner's portal as a notification and to
staff if the owner has not responded within 24 hours. It does not send the owner's phone number to the
enquirer; contact is mediated through Courtland, which is both the product decision and the reason the
platform exists.

## 8. Owner portal: property submission

A five-step `Stepper`, each step a route so a refresh does not lose progress.

```
1  Property type and location      land vs building; state, LGA, area, address
2  Details                        title, description, type, bedrooms, area, amenities
3  Pricing                        rent or price, period, deposit, service charge
4  Media                          direct upload, cover selection, alt text
5  Review and submit               preview, submit for review
```

Progress is persisted at each step: the client keeps the draft in the API via `PATCH /v1/properties/{id}`,
so closing the tab and returning resumes where it left off. A local-storage draft would be lost on a phone
that clears storage and would not be visible to staff who help the owner complete it over the phone.

Land and building diverge at step 3. Land asks for the plot area, the survey reference, the land use
(residential, commercial, mixed, agricultural), and a site plan upload. Building asks for the number of
units, the unit mix, and per-unit pricing.

Submission sets `status = 'in_review'` and notifies staff. The owner sees the review state and cannot edit
the media or the price while in review; they can edit the description, which does not change the commercial
terms.

## 9. Tenant portal

| Card | Data | Empty state |
|---|---|---|
| Rent due | Next unpaid schedule row, days remaining, amount | "You have no upcoming payments" |
| Arrears | Count and total of overdue rows | Hidden when zero |
| Active contract | Term, unit, rent, status | "You have no active tenancy" |
| Open tickets | Count, latest status | "No open maintenance requests" |
| Recent payments | Last five | "No payments yet" |

Payment is the primary action. It opens a sheet with the outstanding rows, lets the tenant choose one or
several, then creates an intent and redirects to Paystack. The return page polls for settlement and shows a
receipt with a download link.

## 10. Performance

| Technique | Where |
|---|---|
| `next/image` with Cloudinary loader | Every image; the loader maps a transform name to a URL |
| Route-level code splitting | Automatic in the App Router |
| Dynamic import for heavy widgets | Map, lightbox, 360 viewer, PDF preview |
| Server Components by default | Only interactive leaves are `'use client'` |
| `loading.tsx` per route group | Skeleton, not a spinner |
| Prefetch on hover | Listing cards prefetch their detail route |
| `content-visibility: auto` on long grids | Skips rendering off-screen cards |

Images are `priority` only for the hero and the first row of the grid. Marking 24 images as priority makes
all 24 compete for the connection, which is the opposite of the intent.

## 11. Error and not-found handling

| Case | Behaviour |
|---|---|
| `notFound()` | Branded 404 with search suggestions, the highest-converting recovery route |
| Route `error.tsx` | Plain-language message, a retry that remounts, and the request id for support |
| Root `error.tsx` | Last-resort boundary; logs to Sentry with the request id |
| Offline | `navigator.onLine` plus a TanStack Query `onlineManager`; mutations queue and show a pending banner |
| API 401 | One refresh attempt, then sign out and redirect |
| API 429 | Respect `Retry-After`; the query is retried after it |
| API 5xx | Retry with backoff, three attempts, then the error state |

A failed payment is never ambiguous to the user. The return page distinguishes "Paystack said it failed",
"we have not heard from Paystack yet", and "we have confirmed it", and never shows a generic error for all
three.

## 12. Testing

| Level | Tool | What |
|---|---|---|
| Unit | Vitest + Testing Library | `cn`, `useMoneyInput`, filter helpers, status maps |
| Component | Vitest + Testing Library | Every component's states, from Storybook |
| E2E | Playwright | Sign-in, search, submit a property, pay rent, download a receipt |
| A11y | axe-core in Playwright | Every portal route, at mobile and desktop |
| Lighthouse | `lighthouse-ci` | Performance, a11y, and SEO budgets, fails the build |
| Visual | Playwright screenshots | Listing page, portal dashboards, admin tables, at three widths |

Visual regression covers the listing page and the two portal dashboards at 360, 768, and 1440 px. Those are
the screens whose layout will break silently.

## 13. Dead-code rules

| Rule | Enforcement |
|---|---|
| No unused component | Knip; an imported-nowhere component in `components/` or `features/` fails |
| No unused route | Every `page.tsx` must be linked from `sitemap.ts`, a portal nav entry, or a test. An orphan route fails |
| No unused hook | Knip |
| No unused query key | `queryKeys` members are checked against `queryKey` and `invalidateQueries` call sites |
| No unused feature flag | A `flags` entry read in fewer than two places fails |
| No hard-coded API URL | `COURTLAND_API_URL` from env only; a literal fails lint |
| No `any` | TypeScript `strict`, and a lint rule |
| No component importing from another app | Import boundaries checked |

## 14. Related documents

- Admin application: [`17-frontend-admin.md`](./17-frontend-admin.md)
- Shared data and API clients: [`18-api-clients-and-state.md`](./18-api-clients-and-state.md)
- Components and tokens: [`15-design-system.md`](./15-design-system.md)
- Vercel deployment: [`23-ci-cd-and-deployment.md`](./23-ci-cd-and-deployment.md)
