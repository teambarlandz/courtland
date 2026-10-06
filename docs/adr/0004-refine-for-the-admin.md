# ADR 0004: Refine for the admin, hand-built UI for the portals

- Status: Accepted
- Date: 2026-02-11
- Deciders: Founder, Lead developer

## Context

The admin panel is, by nature, twenty CRUD screens over data tables with filters. Writing twenty CRUD screens
by hand is weeks of work that adds nothing to the product. The portals are the opposite: a payment flow, a
property submission wizard, a contract view, and a document list, all of which are custom and would be fought
by any CRUD framework.

The choice is whether to use Refine, or something like MUI, or nothing.

## Decision

Refine 5 with `@refinedev/react-router@^2` on `react-router@^7` for the admin. Refine's `dataProvider`,
`authProvider`, and `accessControlProvider` are implemented against the Courtland API, and the permission map
mirrors the API's matrix.

The portals use hand-built components from `packages/ui` with TanStack Query. No CRUD framework.

## Alternatives considered

**Refine for the portals too.** Rejected. Refine's value is list, show, create, edit, and delete over a
resource. The tenant payment flow, the owner property wizard, and the contract view have none of that shape.
Adapting them to Refine's resource model would mean working around it constantly, and the framework would
contribute nothing where the complexity actually is.

**Material UI or Ant Design for the admin.** Rejected. They bring their own design language, which would make
the admin look different from the portals, and their bundle cost is high. Refine is unstyled at the core and
composes with our components.

**No framework; build the admin tables by hand.** Rejected. Twenty resources need pagination, sorting,
filtering, loading states, and error states. TanStack Table plus our components would work, and it is what
happens under Refine's hood, but the surrounding concerns (resource routing, provider composition,
permission-aware hooks, form handling, action buttons) are exactly what Refine provides and would take weeks
to reimplement correctly.

**Refine 4 with `@refinedev/react-router-v6`.** Rejected. React Router 7 is current and supported; building
on the older adapter buys stability at the cost of being a version behind.

## Consequences

**Easier.** Twenty CRUD resources in days rather than weeks. Provider swapping is a clean seam. The
`accessControlProvider` maps directly to our permission model, so the navigation and buttons derive from the
same matrix the API enforces.

**Harder.** Refine's abstractions are real. A resource with a non-CRUD shape, such as the payout run with its
approve-then-initiate flow, needs custom pages outside the resource pattern. The version matrix is awkward:
Refine core and the router adapter are versioned separately, so an upgrade means checking both. When Refine's
model and ours disagree, we either adapt or leave the framework, and leaving it is a rewrite.

**Cost.** A learning curve for anyone new. Occasional friction on the four non-CRUD screens. The upgrade cost
of Refine 5 to 6, which is unknown but not small.

## Revisit when

- More than half the admin screens need to leave the resource pattern. Check: custom pages exceeding half of
  `apps/admin/src/pages`.
- A Refine major upgrade requires rewriting the data or auth provider. Check: the provider API changing shape
  rather than adding fields.
- Refine is unmaintained for 12 months. Check: no release in a year, or open issues unanswered.

Leaving Refine means reimplementing what it does well, which is roughly 800 lines, not 800 pages. That is
the exit cost and it is acceptable.

## Related

- [`../17-frontend-admin.md`](../17-frontend-admin.md)
- ADR 0003, why two build systems
- [`../08-api-design.md § Refine coverage`](../08-api-design.md#11-refine-resource-coverage)
