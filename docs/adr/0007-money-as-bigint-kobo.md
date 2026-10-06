# ADR 0007: Money as integers in kobo, end to end

- Status: Accepted
- Date: 2026-02-12
- Deciders: CTO, Lead developer

## Context

Courtland holds rent, deposits, and instalments for other people's money. Rounding errors are not cosmetic:
₦0.01 out on 500 payments is a reconciliation failure that finance will spend a day on, and a trust problem
for every tenant it affects.

JavaScript has one numeric type for money-sized numbers, and it is a float. `0.1 + 0.2` is not `0.3`.
Postgres has `numeric`, which is exact but has its own costs. The decision is about representation across the
whole stack.

## Decision

**All money is a `bigint` count of kobo.** One hundred kobo to one naira.

| Layer | Representation |
|---|---|
| Database column | `bigint`, named `*_kobo` |
| Drizzle | `bigint` |
| API JSON | A JSON number in kobo, field named `*Kobo` |
| TypeScript | `number` for values, `bigint` where division or accumulation requires it |
| Display | `formatNaira(kobo)`, which never round-trips through a float |
| Input | `parseNaira(string)`, which returns kobo |

`Number.MAX_SAFE_INTEGER` is 9,007,199,254,740,991 kobo, which is ₦90 trillion. No rent in Nigeria reaches
it. A test asserts every amount the API can produce stays inside that bound.

Money never appears as a formatted string in the API. `45000000` with an `amountKobo` field name is
unambiguous; `"₦450,000"` is not parseable without knowing the locale.

## Alternatives considered

**`numeric` in Postgres and floats in JavaScript.** Rejected. Exact in the database and inexact in the
application, which is the worst combination: the bug appears in the layer that computes allocations and then
gets stored as though it were exact.

**`numeric` in Postgres and a decimal library in JavaScript.** Rejected. Adds a dependency to the money path,
which is the path where a bug is most expensive and where the simplest correct representation is preferable.

**Minor units as strings.** Rejected as the wire format. Strings avoid float issues precisely, but they push
parsing into every client and make every consumer write `BigInt(value)` and `Number(value)` in the right
places. The bound check shows integers are safe here.

**Floating point in kobo.** Rejected. The same problem, one decimal place over.

**Store naira, not kobo.** Rejected. ₦0.50 maintenance deductions and ₦562.50 provider fees would not be
representable.

## Consequences

**Easier.** No rounding logic anywhere. Arithmetic is exact. A monthly instalment of ₦4,166,666.67 is
representable and sum-tests exactly. Money formats identically on the server, in the browser, and in the PDF.

**Harder.** Every value needs conversion at display time, so a raw `amountKobo` shown directly is a bug by
convention. Division truncates, so splitting ₦5,000,000 over twelve months needs explicit remainder
distribution, which is exactly the kind of thing that is easy to get wrong and is now unit-tested with
property-based tests. JSON consumers must know the convention, so it is enforced by naming and documented
prominently.

**Cost.** Developer vigilance. `MoneyDisplay` and `MoneyInput` exist so raw values are rarely rendered. The
truncation subtlety in annual-rent splitting is a real trap that needed a dedicated test suite.

## Revisit when

- A currency with three decimal places is introduced. Check: a requirement for a currency where kobo is not
  the natural minor unit. The representation would become `{ amount: string, currency }` per ADR 0017's
  successor.
- An amount approaches `Number.MAX_SAFE_INTEGER`. Check: any single transaction above ₦90 trillion.
  Effectively never.

## Related

- [`../04-domain-model.md § Money`](../04-domain-model.md#4-money)
- [`../18-api-clients-and-state.md § Money`](../18-api-clients-and-state.md#5-money-types)
- ADR 0008, the ledger built on this representation
- ADR 0017, NGN only
