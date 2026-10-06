/**
 * Feature-flag keys and defaults (the `feature_flags` table, not build flags —
 * build flags live in `env-names.ts`; the distinction is `docs/22 § 4.9`).
 *
 * Phase 0: empty except for this documented type, as the roadmap requires
 * ("flags.ts may contain only keys with a reader"). A flag key is added in the
 * phase that also adds its first reader, because `check-flag-usage.mjs`
 * requires every key to be read in at least two files (from Phase 11 onward).
 *
 * When the first flag lands, `FlagKey` becomes a union of its literal keys:
 *
 *     export const flags = { halt_payouts: false } as const;
 *     export type FlagKey = keyof typeof flags;
 */
export type FlagKey = never;
