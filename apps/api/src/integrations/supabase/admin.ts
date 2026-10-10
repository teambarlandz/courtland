// integrations/supabase/admin.ts — service-role client. Only this file and
// jobs/ may import it (docs/02 §5.4). Server-only: never reaches a browser
// bundle. Bypasses RLS — every call through it must re-check in code what RLS
// would have checked.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServiceClient is server-only");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
