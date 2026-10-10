// services/auth/identityLink.ts — claim a pending owners row by phone
// (POST /v1/auth/link-owner). A row with a matching phone and no user yet
// belongs to the caller; the service-role check-then-claim runs as one
// statement so two callers cannot claim the same row.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OwnerStore {
  claimByPhone(userId: string, phone: string): Promise<{ ownerId: string } | null>;
}

export function memoryOwnerStore(
  rows: { id: string; phone: string | null; userId: string | null }[] = [],
): OwnerStore & { rows: { id: string; phone: string | null; userId: string | null }[] } {
  const state = [...rows];
  return {
    rows: state,
    async claimByPhone(userId: string, phone: string): Promise<{ ownerId: string } | null> {
      const row = state.find((r) => r.phone === phone && r.userId === null);
      if (!row) return null;
      row.userId = userId;
      return { ownerId: row.id };
    },
  };
}

export function supabaseOwnerStore(admin: SupabaseClient): OwnerStore {
  return {
    async claimByPhone(userId: string, phone: string): Promise<{ ownerId: string } | null> {
      const { data, error } = await admin
        .from("owners")
        .update({ user_id: userId })
        .is("user_id", null)
        .eq("phone_e164", phone)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`owner claim failed: ${error.message}`);
      if (!data) return null;
      return { ownerId: data.id as string };
    },
  };
}
