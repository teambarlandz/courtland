// client.ts — pooled postgres-js client factory.
// prepare: false is required for pooled URLs (the Supabase pooler speaks the
// simple query protocol; prepared statements are session-scoped and break).
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createClient(connectionString: string): PostgresJsDatabase {
  return drizzle(postgres(connectionString, { prepare: false }));
}
