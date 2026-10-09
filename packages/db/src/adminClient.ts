// adminClient.ts — service-role client factory. Server only: the service role
// bypasses RLS, so this factory refuses to run in a browser bundle. Only the
// API server (and jobs) may import this module.
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createClient } from "./client.ts";

export function createAdminClient(connectionString: string): PostgresJsDatabase {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient is server-only and must not run in a browser bundle");
  }
  return createClient(connectionString);
}
