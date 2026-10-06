# ADR 0005: A hand-built design system on Radix, not a component library

- Status: Accepted
- Date: 2026-02-12
- Deciders: Lead developer

## Context

Courtland's users are on a ₦15,000 Android in Lagos on a prepaid plan, and staff are on a desktop in a letting
office. The same components must work at 360 px and 1440 px. Property photographs are the centre of the
product, so layout stability matters more than visual richness.

The question is whether to adopt a component library, which gets a lot done quickly, or build the components,
which costs time and risks inconsistency.

## Decision

Build the components in `packages/ui`, composed from **Radix UI primitives** with **Tailwind CSS v4** tokens.
Adopt **shadcn/ui's** copy-in model: components are source files in the repository, not a dependency.

| Layer | Choice |
|---|---|
| Primitives | Radix UI: Dialog, Dropdown, Tabs, Select, Popover, Accordion, and the rest |
| Styling | Tailwind v4, tokens as CSS custom properties in `tokens.css` |
| Components | Ours, in `packages/ui/src/components` |
| Icons | `lucide-react`, tree-shaken |
| Storybook | For every component, every state |

## Alternatives considered

**Material UI.** Rejected. Its design language would fight ours, its bundle is large, and its theming system
is a second source of truth for colour and spacing.

**Chakra UI.** Rejected. Same objections, plus a runtime styling engine whose cost shows on a mid-range
Android.

**Ant Design.** Rejected. Excellent for dense data tables, which the admin needs, but heavy for the public
site, and visually wrong for a consumer property product.

**shadcn/ui as a dependency rather than copy-in.** Rejected. shadcn is not designed to be depended on; the
value is that the code becomes yours. Depending on it would put a moving target under our UI.

**Buy nothing; write accessible primitives from scratch.** Rejected. Focus management, keyboard navigation,
ARIA wiring, and scroll locking in a dialog are the exact areas where hand-rolled accessibility is subtly
wrong, and the failures are invisible until a keyboard user finds them.

**A headless library such as Headless UI instead of Radix.** Equivalent. Radix was chosen for its breadth and
its focus-scope implementation.

## Consequences

**Easier.** Total control over markup and styling, so a component can be exactly right for a 360 px screen.
No theme fights. The bundle contains only what we import. Accessibility from Radix rather than from our
attention. Components are testable in isolation with Storybook.

**Harder.** Every component is ours to maintain: thirteen primitives and twelve composites is real work, and
each needs a story, a test, and its states covered. Consistency is a discipline problem, which is why §7 of the
design system doc has explicit contribution rules. A third-party component cannot be dropped in without a
rewrite.

**Cost.** Roughly 2–3 weeks of the initial build. Ongoing: each new component needs a story and tests. The
real ongoing cost is discipline, not code.

## Revisit when

- We fork a component more than three times for the same reason. Check: three divergent copies of one
  component.
- A component needs accessibility work that takes more than a day. Check: Radix not covering a case, such as
  a combobox with async loading and full keyboard control.
- Storybook stories become unreviewed noise. Check: snapshot updates accepted without reading.

If Radix stops covering a needed primitive, extend the wrapper. Do not fall back to a component library,
which reintroduces the design-language fight.

## Related

- [`../15-design-system.md`](../15-design-system.md)
- ADR 0003, both apps share this package
- [`../12-documents-and-pdfs.md`](../12-documents-and-pdfs.md) for the one other package that renders
  user-visible output
