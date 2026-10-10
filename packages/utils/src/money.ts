// money.ts — kobo arithmetic (docs/04 §4). All amounts are bigint kobo;
// formatting is the ONLY place kobo becomes a string. allocateProRata follows
// the STATED intent of private.allocate_pro_rata (largest remainder, ties to
// the earlier index) with per-share floors, which the SQL version gets wrong
// for non-uniform weights — see the function comment.

export function formatNaira(kobo: bigint): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const naira = abs / 100n;
  const remainder = abs % 100n;
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₦${grouped}.${remainder.toString().padStart(2, "0")}`;
}

export function parseNairaToKobo(input: string): bigint {
  const cleaned = input.replace(/[₦,\s]/g, "");
  const match = cleaned.match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error(`cannot parse naira amount: ${input}`);
  const [, sign, whole, frac = ""] = match;
  const kobo = BigInt(whole as string) * 100n + BigInt((frac as string).padEnd(2, "0"));
  return sign === "-" ? -kobo : kobo;
}

export function splitAnnualRent(annualKobo: bigint, months: number): bigint[] {
  if (months < 1) throw new Error("months must be at least 1");
  if (annualKobo < 0n) throw new Error("annual rent must be non-negative");
  const m = BigInt(months);
  const base = annualKobo / m;
  const extra = annualKobo - base * m;
  return Array.from({ length: months }, (_, i) => {
    if (extra > 0n && i < Number(extra)) return base + 1n;
    return base;
  });
}

export function allocateProRata(total: bigint, weights: bigint[]): bigint[] {
  // Correct largest-remainder: each share starts at its own floored fraction
  // (total * w_i) / sum, and the leftover (< weights.length, provably) goes to
  // the largest fractional parts, ties to the earlier index. Non-negative
  // weights therefore always yield non-negative parts that sum to the total.
  //
  // Deliberate divergence from private.allocate_pro_rata in SQL, which floors
  // every share at total / sum (correct only for near-uniform weights; e.g.
  // SQL gives [2,8] for (10, [2,3]) where this gives [4,6], and SQL can emit
  // negative parts when zero weights make the global floor overshoot). The SQL
  // behaviour is pinned by pgTAP, so unifying the two is Phase 12 work, when
  // payment code actually calls the SQL version — see the changelog.
  if (total < 0n) throw new Error("total must be non-negative");
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0n)) throw new Error("weights must be non-negative");
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum <= 0n) throw new Error("weights must sum to a positive value");
  const result = weights.map((w) => (total * w) / sum);
  let extra = total - result.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i));
  for (const slot of order) {
    if (extra <= 0n) break;
    const idx = slot.i as number;
    result[idx] = (result[idx] as bigint) + 1n;
    extra -= 1n;
  }
  return result;
}

export function allocatePayment(amountKobo: bigint, balancesKobo: bigint[]): bigint[] {
  if (amountKobo < 0n) throw new Error("amount must be non-negative");
  let remaining = amountKobo;
  return balancesKobo.map((balance) => {
    if (remaining <= 0n || balance <= 0n) return 0n;
    const take = balance < remaining ? balance : remaining;
    remaining -= take;
    return take;
  });
}
