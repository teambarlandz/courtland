// contract/lifecycle.ts — the 9-state contract machine (docs/09 §2.1, 05 §4
// contract_status, 04 §3.5). The database trigger is the authority; this table
// is the API-side affordance AND the drift check: the lifecycle test asserts
// every pair here against the documented states.
import { z } from "zod";
import type { ContractStatus } from "../common/enums.ts";
import { contractStatusValues } from "../common/enums.ts";

export const TERMINAL_STATES: readonly ContractStatus[] = [
  "rejected",
  "terminated",
  "expired",
  "renewed",
];

export const TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["active"],
  active: ["suspended", "terminated", "expired", "renewed"],
  suspended: ["active"],
  terminated: [],
  rejected: [],
  expired: [],
  renewed: [],
};

for (const from of contractStatusValues) {
  if (TRANSITIONS[from] === undefined) {
    throw new Error(`lifecycle table is missing state ${from}`);
  }
}

export function assertTransition(from: ContractStatus, to: ContractStatus): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`illegal transition: ${from} -> ${to}`);
  }
}

export function isTerminal(status: ContractStatus): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(status);
}

export const LifecycleAction = z.strictObject({
  reason: z.string().max(2000).optional(),
});
export type LifecycleAction = z.infer<typeof LifecycleAction>;
