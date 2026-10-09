// withRls.ts — run a callback inside a transaction with the caller's JWT claims
// installed as Postgres GUCs, so RLS policies see the request identity.
// Mirrors what PostgREST sets (request.jwt.claims); request.jwt.claim.sub is
// set too because auth.uid() reads it.
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface RlsClaims {
  sub: string;
  role?: string;
  courtlandRoles?: string[];
}

type Transaction = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];

export async function withRls<T>(
  db: PostgresJsDatabase,
  claims: RlsClaims,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const payload = {
    sub: claims.sub,
    role: claims.role ?? "authenticated",
    app_metadata: { courtland_roles: claims.courtlandRoles ?? [] },
  };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${claims.sub}, true)`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(payload)}, true)`,
    );
    return fn(tx);
  });
}
