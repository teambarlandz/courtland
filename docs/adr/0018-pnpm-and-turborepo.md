# ADR 0018: pnpm workspaces with Turborepo

- Status: Accepted
- Date: 2026-02-18
- Deciders: Lead developer

## Context

The repository will hold six applications and eight packages:

| Applications | Packages |
|---|---|
| `apps/api`, `apps/web`, `apps/admin` | `packages/config`, `packages/types`, `packages/utils`, `packages/db`, `packages/api-client`, `packages/ui`, `packages/emails`, `packages/pdf`, `packages/logger`, `packages/media` |

They share types heavily: the permission matrix, the status enums, the money helpers, the API error codes,
and the validation schemas. A change to an enum in `packages/types` must propagate to the database, the API
schemas, the generated OpenAPI document, the frontend types, the admin's colour map, and the tests, with no
version skew.

## Decision

**pnpm workspaces** with **Turborepo** for task orchestration and caching.

| Choice | Rationale |
|---|---|
| pnpm, not npm or yarn | Strict, content-addressable node_modules: a package cannot see a dependency it did not declare, which is exactly the guarantee an import-boundary rule needs. Disk-efficient, and faster in CI |
| pnpm's strictness as a feature | The "phantom dependency" error it raises is a real class of bug caught at install time rather than at runtime |
| Turborepo | Caches task outputs by content hash, so a change in `packages/utils` reruns money's consumers and not the rest. Pipeline-aware, so typecheck waits for build |
| One `pnpm-lock.yaml` | One dependency graph, one resolution, no version skew between apps |
| `workspace:*` protocol | A local dependency's version is declared, and a mistake where it should be external fails rather than resolving from the registry |

## Alternatives considered

**npm workspaces.** Rejected. Npm hoists dependencies to the root `node_modules`, so a package can import
something it never declared and it works locally but fails in a clean install. That is a real and
hard-to-detect bug class.

**Yarn PnP or Yarn Berry with node-modules linker.** Rejected. PnP's strictness is comparable to pnpm's, but
the tooling ecosystem has more rough edges, and several build tools need explicit configuration for PnP. pnpm
is the pragmatic strict option.

**Nx.** Rejected. Genuinely capable, with caching and affected-detection similar to Turborepo. Rejected for
its plugin architecture and configuration surface, which is more machinery than six applications need, and
because Nx's build-graph conventions add a layer of indirection the team would have to learn.

**Turborepo with npm.** Rejected. It would work, but it would lose pnpm's install-time guarantee, which is
the more valuable of the two.

**A single application with folders, no packages.** Rejected. The shared code between the API, the web app,
and the admin is substantial: types, money formatting, validation schemas, and the API client. Without
packages there is no boundary, so the API's database client becomes importable from the browser.

## Consequences

**Easier.** One install, one lockfile, no version skew. Turborepo makes a monorepo's build fast enough not to
be a reason to avoid it: caching means a typecheck touches only what changed. `pnpm -r` and `turbo` give clean
commands for building, testing, and linting everything. Local packages are versioned like real dependencies,
so promoting one to a published package later is not a restructuring.

**Harder.** Monorepo tooling has sharp edges: a lockfile conflict is harder to resolve than a single-package
one, and a stale cache produces a failure that looks like a code bug. Cross-package changes need care about
build order. `tsconfig` references and project boundaries must be configured deliberately or imports leak
between packages. Contributors need to understand why a type change requires a rebuild.

**Cost.** Learning Turborepo's caching model. Occasional cache invalidation surprises. Discipline about
package boundaries, which CI enforces rather than trusting convention.

## Revisit when

- The package count exceeds about 20. Check: Turborepo task graph size and cache hit rate.
- Cold CI builds exceed 15 minutes. Check: the pipeline timing report.
- Turborepo's cache produces a wrong result that costs debugging time. Check: an incident log entry.

Nx is the migration if the graph outgrows Turborepo's simplicity. pnpm's strictness should stay either way;
that is the part providing the guarantee.

## Related

- [`../02-repository-structure.md`](../02-repository-structure.md)
- [`../03-technology-stack.md`](../03-technology-stack.md)
- [`../23-ci-cd-and-deployment.md § Caching`](../23-ci-cd-and-deployment.md#21-caching)
