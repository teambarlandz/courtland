# 18 — API clients and state

Three clients talk to `apps/api`: the Next.js app, the Refine admin, and scripts. They share one typed
core in `packages/api-client` and differ only in how they obtain a token.

## 1. Package layout

```
packages/api-client/
  src/
    types/generated.ts        generated from the OpenAPI document
    schemas/                  Zod schemas for runtime validation of responses
    errors.ts                 ProblemDetails, the error class hierarchy
    problem.ts                problem+json → typed error
    money.ts                  MoneyInput, MoneyOutput, formatNaira, parseNaira
    client.ts                 createApiClient(fetchImpl)
    admin.ts                  Refine dataProvider factory
    react.ts                  hooks for TanStack Query
    index.ts
```

One package, three entry points. The Next app uses `client.ts` and `react.ts`; the admin uses `admin.ts` and
`react.ts`; scripts use `client.ts` directly. No app reimplements a client.

## 2. Generated types

```bash
pnpm --filter @courtland/api gen:openapi
pnpm --filter @courtland/api-client gen:types
```

`gen:types` runs `openapi-typescript` over `docs/openapi/courtland.json` and writes
`types/generated.ts`. A CI check regenerates and diffs; a difference fails the build.

Why generated rather than handwritten: a hand-written client type drifts from the API within weeks and
then reports a type error on code that works fine at runtime. Generated types are correct by construction,
and the API's `422` on an unknown field keeps them honest.

Generated file header:

```ts
// AUTO-GENERATED. Do not edit.
// Source: docs/openapi/courtland.json
// Regenerate: pnpm --filter @courtland/api-client gen:types
```

With `knip` configured to ignore the file and a `tooling/scripts/check-generated-drift.mjs` script that fails on drift, so it is
excluded from lint and typecheck noise.

## 3. The core client

```ts
// packages/api-client/src/client.ts
export type AuthMode = 'cookie' | 'bearer'

export interface ApiClientOptions {
  baseUrl: string
  // 'cookie' is the browser path: the browser attaches the session cookie itself and the client echoes the
  // CSRF cookie. 'bearer' is the server and script path. There is no mode that does both.
  auth: AuthMode
  getAccessToken?: () => Promise<string | null>   // required when auth === 'bearer'
  getCsrfToken?: () => string | null              // required when auth === 'cookie'
  fetchImpl?: typeof fetch
  onUnauthorized?: () => void
  defaultTimeoutMs?: number
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch

  async function request<T>(method: string, path: string, init: RequestInit & {
    body?: unknown
    idempotencyKey?: string
    timeoutMs?: number
  } = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.defaultTimeoutMs ?? 15_000)
    if (init.signal) init.signal.addEventListener('abort', () => controller.abort())

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-request-id': crypto.randomUUID(),
      ...init.headers,
    }
    if (opts.auth === 'bearer') {
      const token = await opts.getAccessToken!()
      if (token) headers.authorization = `Bearer ${token}`
    } else {
      const csrf = opts.getCsrfToken?.()
      if (csrf) headers['x-csrf-token'] = csrf
    }
    if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey

    let response: Response
    try {
      response = await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
        credentials: opts.auth === 'cookie' ? 'include' : 'omit',
      })
    } catch (err) {
      clearTimeout(timeout)
      if ((err as Error).name === 'AbortError') {
        throw new NetworkTimeoutError(path, (err as Error).name)
      }
      throw new NetworkError(path, (err as Error).message)
    }
    clearTimeout(timeout)

    if (response.status === 401) {
      opts.onUnauthorized?.()
      throw new UnauthenticatedError(await safeProblem(response))
    }

    if (!response.ok) throw await problemFrom(response)

    if (response.status === 204) return undefined as T
    const json = await response.json()
    return json.data as T
  }

  return {
    get:    <T>(p: string, o?: RequestInit)             => request<T>('GET', p, o),
    post:   <T>(p: string, body?: unknown, o?: RequestInit & { idempotencyKey?: string }) =>
              request<T>('POST', p, { ...o, body }),
    patch:  <T>(p: string, body: unknown, o?: RequestInit) => request<T>('PATCH', p, { ...o, body }),
    put:    <T>(p: string, body: unknown, o?: RequestInit) => request<T>('PUT', p, { ...o, body }),
    delete: <T>(p: string, o?: RequestInit)              => request<T>('DELETE', p, o),
  }
}
```

Four behaviours worth naming:

1. **Always a timeout.** A request with no timeout on a Nigerian mobile network is a spinner that lasts
   until the browser gives up. 15 seconds, and the caller gets a typed error.
2. **`x-request-id` on every request.** When a user reports a problem, this id is in the server logs.
3. **A 401 calls `onUnauthorized`.** The session is dead; the app signs out. Without the hook, a stale
   session produces an app that appears to be loading forever.
4. **Unwraps `data`.** Every caller gets the resource, never the envelope.

## 4. Errors

```ts
// packages/api-client/src/errors.ts
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly problem: ProblemDetails,
    readonly status: number,
  ) { super(problem.detail); this.name = new.target.name }
}

export type ApiErrorKind =
  | 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict'
  | 'rate_limited' | 'business_rule' | 'payment' | 'provider' | 'network'
  | 'timeout' | 'unknown'

export class ValidationError extends ApiError {
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem.errors ?? []).map((e) => [e.path, e.message]),
    )
  }
}
```

The `kind` is derived from `problem.code`, the stable machine code, never from `problem.detail`. A copy
change to a message does not change error handling.

`fieldErrors` maps straight onto a form:

```tsx
const mutation = useMutation({ mutationFn: createContract })

<form onSubmit={handleSubmit(async (values) => {
  try {
    await mutation.mutateAsync(values)
  } catch (err) {
    if (err instanceof ValidationError) {
      setServerErrors(err.fieldErrors)     // renders against inputs, not as a banner
    } else {
      setFormError(err.message)
    }
  }
})}>
```

## 5. Money types

```ts
// packages/api-client/src/money.ts
export interface Money {
  amountKobo: number
  currency: 'NGN'
}

export function naira(amountKobo: number): Money {
  return { amountKobo, currency: 'NGN' }
}

export function formatNaira(kobo: bigint | number): string {
  const v = BigInt(kobo)
  const negative = v < 0n
  const abs = negative ? -v : v
  const nairaPart = abs / 100n
  const koboPart = abs % 100n

  const grouped = nairaPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const body = koboPart === 0n ? grouped : `${grouped}.${koboPart.toString().padStart(2, '0')}`
  return `${negative ? '−' : ''}₦${body}`
}

export function parseNaira(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [n, k = '0'] = cleaned.split('.')
  return Number(n) * 100 + Number(k.padEnd(2, '0'))
}
```

A minus sign is U+2212, not a hyphen, so a negative amount reads as an accounting negative rather than a
dash. `parseNaira` rejects a third decimal place: ₦100.005 does not exist in kobo, and silently rounding
it would be the kind of bug that costs a customer ₦0.01 and a support ticket.

Every money value crossing the wire is `{ amountKobo, currency }`, never a bare number in a bag of
fields. A bare `amount: 45000000` is ambiguous between naira and kobo, and that ambiguity is how a
hundredfold error happens.

## 6. React Query integration

```ts
// packages/api-client/src/react.ts
export function createQueryKeys(scope: string) {
  return {
    list: (resource: string, filters?: unknown) => [scope, resource, 'list', filters] as const,
    one:  (resource: string, id: string)        => [scope, resource, 'one', id] as const,
  }
}

export function useApiMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  opts: { invalidates: ReadonlyArray<readonly unknown[]>; onSuccess?: (out: TOutput) => void } = { invalidates: [] },
) {
  return useMutation({
    mutationFn: fn,
    onSuccess: (out) => {
      for (const key of opts.invalidates) queryClient.invalidateQueries({ queryKey: key })
      opts.onSuccess?.(out)
    },
    retry: (failureCount, error) => {
      // Never retry a 4xx: it will fail identically, and the user is waiting.
      if (error instanceof ApiError && error.status < 500) return false
      return failureCount < 2
    },
  })
}
```

`retry` returning `false` for any 4xx is the important part. The default TanStack Query retry is three
attempts with exponential backoff, which means a validation error takes four seconds to appear and a 403
takes four seconds to become a 403.

### 6.1 Optimistic updates

Only where the update is trivially reversible and the server accepts it:

| Case | Optimistic | Rollback |
|---|---|---|
| Saved search create | Yes | Delete on error |
| Filter view save | Yes | Remove on error |
| Media reorder | Yes | Restore order on error |
| Contract status change | No | — |
| Any payment | No | — |

An optimistic payment would show a tenant a receipt for money that has not arrived. The rule is that money
and legal state are never optimistic, because the cost of being wrong is a customer's trust.

## 7. Cursor pagination

```ts
export function useInfiniteList<T>(
  key: readonly unknown[],
  fetchPage: (cursor?: string) => Promise<{ data: T[]; meta: PageMeta }>,
  limit = 24,
) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.nextCursor : undefined),
  })
}
```

`getNextPageParam` returns `undefined` when there is no next page, which is what makes the `Load more`
button disappear. There is no total count to render, because the API does not return one and computing one
on `properties` would be a table scan.

Intersection Observer drives the fetch, with an explicit button as the accessible alternative. An infinite
scroll that only works with a mouse wheel fails for keyboard users and for screen readers.

## 8. The admin data provider

```ts
// packages/api-client/src/admin.ts
export function createAdminDataProvider(api: ReturnType<typeof createApiClient>) {
  return dataProvider({
    apiClient: {
      getList: async ({ resource, pagination, sorters, filters }) => {
        const params = toQueryParams({ pagination, sorters, filters })
        const res = await api.get<RawList>(`/v1/${resource}?${params}`)
        return { data: res.data, total: res.meta.count, meta: { ...res.meta } }
      },
      getOne:  async ({ resource, id }) => ({ data: await api.get(`/v1/${resource}/${id}`) }),
      create:  async ({ resource, variables }) => ({ data: await api.post(`/v1/${resource}`, variables) }),
      update:  async ({ resource, id, variables }) => ({ data: await api.patch(`/v1/${resource}/${id}`, variables) }),
      deleteOne: async ({ resource, id }) => { await api.delete(`/v1/${resource}/${id}`) },
      deleteMany: async ({ resource, ids }) => { for (const id of ids) await api.delete(`/v1/${resource}/${id}`) },
      getApiUrl: () => '',
    },
    naming: { singular: 'Property', plural: 'Properties', prefetchGetList: true, prefetchGetOne: false, getList: 'getMany' },
  })
}
```

`total: res.meta.count` is the page size, not the total. Refine's `useTable` accepts a total for
pagination display; giving it the page count makes it show "1–24 of 24" until the next page loads, which is
the honest answer for a cursor-paginated list. The admin tables use "Load more" rather than numbered pages
for the same reason.

## 9. Server-side client

The Next app's server fetch, deliberately not the shared client: it forwards the request cookie instead of
minting a credential, and it must not be reachable from a Client Component.

```ts
// apps/web/lib/api/server.ts
import 'server-only'
import { cache } from 'react'

export const apiGet = cache(async (path: string) => {
  const cookieStore = await cookies()
  const res = await fetch(`${env.COURTLAND_API_URL}${path}`, {
    headers: {
      cookie: cookieStore.toString(),
      'x-csrf-token': cookieStore.get('courtland-csrf')?.value ?? '',
      'x-request-id': headers().get('x-request-id') ?? crypto.randomUUID(),
    },
    cache: 'no-store',
  })
  if (!res.ok) throw toProblem(res)
  return (await res.json()).data
})
```

`import 'server-only'` is load-bearing. The shared client is usable from a browser, and if this module were
importable there the CSRF token would be readable by any XSS payload — the one thing the HttpOnly cookie
was supposed to prevent. `apps/web/lib/api/client.ts` is the browser twin, and it reads the CSRF cookie
because that cookie is deliberately not `HttpOnly`.

`cache()` from React dedupes identical fetches within one render pass, which is what prevents a page that
calls `getProperty` and `getRelatedProperties` from making the same request twice. `cache: 'no-store'` is
mandatory on per-user routes.

## 10. Error boundaries

| Level | Component | Shows |
|---|---|---|
| Field | Zod + `fieldErrors` | Inline, per input |
| Form | `<FormError>` | Above the submit button |
| Route | `error.tsx` | Plain message, retry, request id |
| Root | `global-error.tsx` | Last resort, minimal HTML, no dependency on React context |

Every boundary logs to Sentry with the request id. A boundary that swallows an error silently is worse
than no boundary, because the page looks fine and nothing was logged.

## 11. Caching rules

| Data | staleTime | gcTime | Optimistic |
|---|---|---|---|
| Public listings | 5 min | 30 min | No |
| Public property detail | 5 min | 1 h | No |
| Facets | 10 min | 1 h | No |
| Portal contracts | 30 s | 5 min | No |
| Portal payments | 30 s | 5 min | No |
| Portal notices | 60 s | 10 min | No |
| Owner properties | 60 s | 10 min | Yes on media reorder |
| Admin lists | 30 s | 5 min | No |
| Admin permissions | Session | Session | No |
| Reconciliation status | 30 s | 2 min | No |

Admin permissions live for the session rather than 30 seconds, because re-fetching the permission list on
every navigation is a request per click for data that changes rarely. The cost is that a permission change
needs a page reload to appear, which is documented in [`19-security.md`](./19-security.md#161-staff-permission-changes).

## 12. Dead-code rules

| Rule | Enforcement |
|---|---|
| No unused client method | Knip; `deleteMany` unused fails. It is used by bulk delete, which exists on three resources |
| No unused error class | Knip |
| No unused query key | Cross-checked against `useQuery` and `invalidateQueries` call sites |
| No untyped `api.get` call | A generic-less call fails a lint rule; every call names its type |
| Generated file never hand-edited | Regeneration diff check |
| No duplicate client | Import boundaries prevent an app defining its own `fetch` wrapper |
| Every `money.ts` function used | Knip; `parseNaira` is used by `MoneyInput` |

## 13. Related documents

- API contract: [`08-api-design.md`](./08-api-design.md)
- Web app usage: [`16-frontend-web.md`](./16-frontend-web.md)
- Admin usage: [`17-frontend-admin.md`](./17-frontend-admin.md)
- Money and kobo: [`04-domain-model.md § Money`](./04-domain-model.md#4-money)
