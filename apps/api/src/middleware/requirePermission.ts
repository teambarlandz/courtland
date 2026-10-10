// middleware/requirePermission.ts — guard factory (docs/08 §5).
// Re-exported here so routes import the guard from its documented path; the
// implementation lives in auth.ts next to the identity it guards.

export { requirePermission } from "./auth.ts";
