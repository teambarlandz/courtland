# 15 — Design system

Courtland's interface is used on a ₦15,000 Android in Lagos, a 2019 iPhone, and a desktop in a letting
office. The design system exists to make all three work without three designs.

## 1. Principles

| Principle | In practice |
|---|---|
| Mobile first, genuinely | The base layout is the phone layout. Desktop is an enhancement, not a separate design. |
| Nigerian network conditions are the default | Optimised images, skeleton loaders, no layout shift, works on 2G with a slow API |
| One accent colour | Green, used for actions and money. Nothing else competes. |
| Numbers are legible | Tabular numerals on every money figure, right-aligned, never truncated |
| Touch targets are 44 px | Minimum for anything tappable, not 32 |
| No dark mode in v1 | One theme, done properly, beats two themes done adequately |
| No component library | Hand-built on Radix primitives. shadcn's copy-in model, not a dependency. |

### 1.1 Why not a component library

MUI, Chakra, and Ant Design impose their own design language and their own bundle cost. shadcn/ui is
different: it copies source into the repository, so the code is ours, the bundle is only what we import, and
a component can be changed without fighting a theme system. The trade is that every component is a file we
maintain, which is why §7 has a rule about not forking.

## 2. Tokens

Defined once in `packages/ui/src/styles/tokens.css` and consumed as CSS custom properties. Tailwind v4
maps them into its theme, so `bg-brand-600` and `var(--color-brand-600)` are the same value.

### 2.1 Colour

| Token | Light | Use |
|---|---|---|
| `--color-brand-50` … `900` | espresso-brown scale | Primary actions, links |
| `--color-neutral-50` … `900` | slate scale | Text, borders, surfaces |
| `--color-success-600` | `#0F7B4F` | Paid, approved, verified |
| `--color-warning-600` | `#B45309` | Pending, needs action |
| `--color-danger-600` | `#B42318` | Failed, overdue, destructive |
| `--color-info-600` | `#175CD3` | Informational |
| `--color-surface` | `#FFFFFF` | Cards, panels |
| `--color-surface-muted` | `#F8FAFC` | Page background |
| `--color-text-primary` | `#0F172A` | Body |
| `--color-text-secondary` | `#475569` | Secondary |
| `--color-text-muted` | `#64748B` | Hints, disabled |

Contrast is checked against WCAG AA: body text ≥ 4.5:1, large text and UI borders ≥ 3:1. `--color-brand-600`
on white is 4.6:1, so it passes as a link colour, and `--color-brand-700` is used for link hover where
`--color-brand-500` would be 3.1:1 and fail.

Semantic colours are never used decoratively. A red button is a destructive action, not a highlight.

### 2.2 Type

Inter, self-hosted via `next/font/local`, with a system-font fallback stack.

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-xs` | 12 px | 1.4 | Legal, timestamps |
| `text-sm` | 14 px | 1.5 | Secondary, table cells |
| `text-base` | 16 px | 1.6 | Body |
| `text-lg` | 18 px | 1.4 | Card titles |
| `text-xl` | 22 px | 1.3 | Section headings |
| `text-2xl` | 30 px | 1.2 | Page titles |
| `text-3xl` | 36 px | 1.15 | Hero |

Money uses `font-variant-numeric: tabular-nums` via the `.money` class, so a column of figures aligns.
Proportional digits in a rent schedule make a legitimate invoice look fraudulent.

Fluid sizing at the two largest steps only, via `clamp()`, because a 30 px page title on a 360 px screen is
already right and a 22 px one on a 1440 px screen is not.

### 2.3 Space, radius, shadow

Four-point scale: `4, 8, 12, 16, 24, 32, 48, 64`. Radii: `sm 4`, `md 8`, `lg 12`, `full 9999`. Shadows: two
levels, `sm` for cards and `md` for modals. Nothing heavier; a property listing page is not a dashboard.

### 2.4 Motion

| Token | Duration | Used for |
|---|---|---|
| `--duration-fast` | 120 ms | Hover, focus |
| `--duration-base` | 200 ms | Dropdown, tooltip |
| `--duration-slow` | 320 ms | Drawer, modal |

Transitions only on `opacity` and `transform`, never on layout properties. `prefers-reduced-motion` collapses
every duration to 0 ms, and the modal and drawer animations are removed rather than shortened.

## 3. Layout

```
Container widths:
  container       max-w-md    28rem   Single column, forms
  container       max-w-3xl   48rem   Reading, forms on mobile
  container       max-w-6xl   72rem   Search grid
  container       max-w-7xl   80rem   Admin, dashboards

Breakpoints (Tailwind v4 defaults):
  sm   640px    2-column grids
  md   768px    Sidebar collapses to icons in admin; 3-column search grid
  lg   1024px   Full sidebar; 4-column search grid
  xl   1280px   Wider container
```

Search results are 1 column on mobile, 2 on `sm`, 3 on `md`, 4 on `lg`. One column on mobile is
non-negotiable: a two-column grid of property photos on a 360 px screen produces 160 px cards.

## 4. Components

`packages/ui/src/components/`, each a file, each with a Storybook story and a test.

### 4.1 Primitives (Radix wrappers)

`Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Dialog`, `Drawer`,
`Popover`, `Tooltip`, `Tabs`, `Accordion`, `Combobox`, `DatePicker`, `Toast`, `Form`.

Each wraps a Radix primitive, adds the token classes, and forwards refs. Radix is a dependency; these
wrappers are ours.

### 4.2 Composite

| Component | Notes |
|---|---|
| `MoneyDisplay` | Renders kobo as ₦ with separators and tabular numerals. Never accepts a formatted string |
| `MoneyInput` | Accepts kobo, displays formatted. Parses "450,000" and "₦450,000" |
| `StatusBadge` | Status to colour, from one map shared with the API's enum |
| `DataTable` | Column definitions, sorting, cursor pagination, loading and empty states |
| `ImageWithFallback` | Blurhash placeholder, then the transformed image, then an error state |
| `PropertyCard` | Cover photo, price, location, badges. The most-used component in the product |
| `UnitPicker` | Units within a property, with availability |
| `FileDropzone` | Direct-to-Cloudinary upload with progress |
| `EmptyState` | Icon, title, description, one action |
| `Skeleton` | Matches the layout of what it replaces, to avoid shift |
| `ErrorBoundary` | Per route, with a retry that remounts |
| `Stepper` | Multi-step forms: property submission, contract creation, KYC |
| `FilterSheet` | Bottom sheet on mobile, sidebar on desktop. Same filter state |

### 4.3 MoneyDisplay

```tsx
export function MoneyDisplay({ kobo, showZero = false, className }: Props) {
  if (kobo === 0n && !showZero) return <span className="text-muted">—</span>
  return <span className={`money ${className}`}>{formatNaira(kobo)}</span>
}
```

One formatter, used everywhere, from `packages/utils`. `formatNaira` is exhaustive-tested:

```ts
describe('formatNaira', () => {
  it.each([
    [0n, '₦0'],
    [1n, '₦0.01'],                                  // kobo precision is preserved
    [100n, '₦1'],
    [375000000n, '₦3,750,000'],
    [450000000000n, '₦4,500,000,000'],
  ])('%s → %s', (kobo, expected) => {
    expect(formatNaira(kobo)).toBe(expected)
  })
})
```

Kobo precision is preserved at the bottom end. A rent of ₦0.01 is absurd, but a maintenance deduction of
₦150 kobo is not, and rounding it to ₦0 makes the ledger and the screen disagree.

### 4.4 StatusBadge

One map, in `packages/types/src/status/colors.ts`, generated from the enum definitions so a new status
cannot be added without a colour:

```ts
export const STATUS_COLORS = {
  property: { draft: 'neutral', in_review: 'info', approved: 'info', published: 'success',
              let_agreed: 'success', under_offer: 'warning', sold: 'success', withdrawn: 'neutral',
              rejected: 'danger', archived: 'neutral' },
  contract: { draft: 'neutral', in_review: 'info', approved: 'info', active: 'success',
              suspended: 'warning', terminated: 'neutral', rejected: 'danger',
              expired: 'neutral', renewed: 'neutral' },
  payment:  { pending: 'warning', succeeded: 'success', failed: 'danger', reversed: 'danger' },
  // …
} as const satisfies Record<string, Record<string, Tone>>
```

`satisfies` plus an exhaustive unit test means adding a status without a colour fails the build. A status
that renders as unstyled grey text is a status nobody can read.

## 5. Forms

The pattern is consistent everywhere, which is what makes forms learnable.

```tsx
const schema = z.object({
  rentAmount: z.coerce.number().int().positive(),
  termMonths: z.coerce.number().int().min(1).max(60),
  dueDay: z.coerce.number().int().min(1).max(28),
})

type FormValues = z.input<typeof schema>

export function LeaseForm({ onSubmit }: Props) {
  const [mutation, formState] = useMutation({ mutationFn: submit })

  return (
    <form onSubmit={formState.handleSubmit(async (values) => {
      const parsed = schema.safeParse(values)
      if (!parsed.success) { formState.setError('root', parsed.error.issues[0]); return }
      await mutation.mutateAsync(parsed.data)
    })}>
      <MoneyInput name="rentAmount" label="Monthly rent" error={formState.errors.rentAmount?.message} />
      <Select name="termMonths" label="Term" options={termOptions} />
      <Select name="dueDay" label="Rent due on the" options={dayOptions} />
      {formState.errors.root && <FormError>{formState.errors.root.message}</FormError>}
      <Button type="submit" loading={mutation.isPending}>Create lease</Button>
    </form>
  )
}
```

| Rule | Why |
|---|---|
| One schema, client and server | The client's Zod schema is imported from `packages/types`, the same module the API uses. A rule cannot differ between them. |
| Server errors map to fields | The `errors[]` array from `problem+json` is keyed by path. `422` renders against inputs, not as a banner |
| No submit without validation | A form that posts and then shows a server error has wasted the user's data entry |
| Inline validation on blur, not on every keystroke | Validating "₦4,5" as the user types "₦4,500" is hostile |
| Disable the button while pending | A double-submit creates a double lease. The button's `loading` prop is the mechanism |
| Money inputs are kobo | `MoneyInput` handles display and parse. No form ever holds a formatted string as its value |

## 6. Loading, empty, error states

Every async view has all three, and a view missing any is a bug.

```
Loading    Skeleton matching the final layout. Not a spinner, except for a full-page navigation
           under 300 ms where a skeleton would flash.
Empty      Icon, one sentence explaining what would be here, one action to create it.
           "No properties yet. Add your first property to start receiving enquiries."
Error      What failed, in plain language, plus a retry.
           "We couldn't load your payments. Check your connection and try again."
```

Distinguishing the empty state from the error state matters: an empty list is a success with nothing in it,
and showing it as an error makes users think something is broken.

## 7. Contribution rules

| Rule | Reason |
|---|---|
| No forked copy of a component without a comment explaining why | Otherwise there are three slightly-different Buttons and nobody knows which is canonical |
| Every component has a Storybook story | A component without one is a component nobody has looked at |
| Every component has a test for its states | Loading, empty, error, disabled, long text |
| Long content is tested | A property title of 120 characters, a name of 60. Text overflow is found in a story, not in production |
| Money always goes through `MoneyDisplay` or `MoneyInput` | Two formatting implementations is two wrong ones |
| Colour only from tokens | A hard-coded hex is a hard-coded contrast failure waiting to happen |

## 8. Storybook

`apps/web/.storybook`, published as a static build in CI so it can be reviewed without running anything.

| Group | Stories |
|---|---|
| Foundations | Colour, type, space, radius, shadow, motion |
| Primitives | Every component, every state |
| Composite | `PropertyCard`, `MoneyDisplay`, `DataTable`, `StatusBadge`, `FileDropzone`, `Stepper` |
| Patterns | Property submission, contract creation, payment flow, KYC |
| Pages | Full page compositions, at mobile and desktop |

A component lands in the product only when its story exists. That is the enforcement, not a guideline.

## 9. Accessibility

| Requirement | Implementation |
|---|---|
| Keyboard navigation | Everything reachable and operable. Radix gives this for the primitives; composites are tested |
| Focus visible | A 2 px brand ring, always, including on custom controls |
| Landmarks | `<header>`, `<nav>`, `<main>`, `<footer>`. One `<main>` per page |
| Labels | Every input has a `<label>`. A placeholder is not a label |
| Errors | `aria-describedby` linking the input to its error; `role="alert"` on submission failures |
| Modals | Focus trap, focus returned on close, `Escape` closes |
| Images | `alt` from `alt_text`, which is required before publish |
| Contrast | AA, verified in CI by a Storybook test over every token pair |
| Touch targets | 44 px minimum |
| Reduced motion | Honoured |

## 10. Performance budget

| Metric | Budget | Enforcement |
|---|---|---|
| LCP | ≤ 2.5 s on 4G | Lighthouse CI, fails the build |
| INP | ≤ 200 ms | Lighthouse CI |
| CLS | ≤ 0.1 | Lighthouse CI |
| Initial JS | ≤ 180 KB gzipped, public site | Bundle size check in CI |
| Portal JS | ≤ 300 KB gzipped | Same |
| Admin JS | ≤ 500 KB gzipped | Same; Refine plus TanStack Query |
| Image weight | ≤ 150 KB per listing card | `ImageWithFallback` requests `card_md` |

Images are the reason most of this is achievable on a Nigerian connection. A 3 MB hero image blows the LCP
budget on its own; a 40 KB AVIF does not.

## 11. Structure

```
packages/ui/
  src/
    styles/tokens.css
    styles/base.css
    components/            13 primitives, 12 composite
    hooks/                 useMediaQuery, useMoneyInput, useFocusTrap
    lib/                   cn()
  tailwind.preset.ts
```

`packages/ui` has no dependency on any app and no dependency on the API client. It receives values and
callbacks. An app depends on it; it depends on nothing of ours.

## 12. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every exported component has a story | Storybook index test fails the build on an unstoried export |
| Every story-referenced component is used in an app | A story for a component nothing uses fails `tooling/scripts/check-component-usage.mjs` |
| No unused token | A script compares token definitions to `var(--…)` usage across the repo |
| No unused prop | Knip with `include: 'props'`; an unused prop on an exported component fails |
| No hard-coded colour | Lint rule against hex literals outside `tokens.css` |
| No unused story | The reverse test: a story with no component export behind it fails |

## 13. Related documents

- Portal and site implementation: [`16-frontend-web.md`](./16-frontend-web.md)
- Admin implementation: [`17-frontend-admin.md`](./17-frontend-admin.md)
- Money package: [`04-domain-model.md § Money`](./04-domain-model.md#4-money)
- Accessibility as a security and quality concern: [`19-security.md`](./19-security.md)
