// reference.ts — human-facing references. Prefixes follow the SQL truth
// (private.set_reference trigger + seed sequences), NOT the stale lists in
// docs/04 §6 and docs/02: payouts (PO-…) are app-generated, everything else is
// prefix + zero-padded sequence (lpad(nextval, 6, '0')).

export const REFERENCE_PREFIXES = {
  owner: "OWN-",
  property: "PRT-",
  contract: "CLT-",
  saleAllocation: "ALC-",
  payment: "PAY-",
  ticket: "MNT-",
  dispute: "DSP-",
  document: "DOC-",
} as const;
export type ReferenceEntity = keyof typeof REFERENCE_PREFIXES;

export function formatReference(entity: ReferenceEntity, seq: number): string {
  if (!Number.isInteger(seq) || seq < 0) throw new Error("sequence must be a non-negative integer");
  return `${REFERENCE_PREFIXES[entity]}${String(seq).padStart(6, "0")}`;
}

export function formatPayoutReference(year: number, month: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 0) throw new Error("sequence must be a non-negative integer");
  return `PO-${year}-${String(month).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;
}

export function parseReferenceKind(value: string): ReferenceEntity {
  const prefix = value.slice(0, 4);
  const entries = Object.entries(REFERENCE_PREFIXES) as [ReferenceEntity, string][];
  const found = entries.find(([, p]) => p === prefix);
  if (!found) throw new Error(`unknown reference prefix: ${value}`);
  return found[0];
}
