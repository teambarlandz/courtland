// services/auth/onboarding.ts — profile completion across onboarding_state
// (phone_only → verified → profile_complete → role_selected → complete).
// Reads/writes go through a narrow ProfileStore so tests use a memory fake;
// the supabase implementation queries profiles with the caller's own client
// (RLS applies — no service role needed to edit your own profile).
import type { SupabaseClient } from "@supabase/supabase-js";

type OnboardingAction = "verify" | "save-profile" | "choose-role";

function nextOnboardingState(current: string, action: OnboardingAction): string {
  if (action === "verify" && current === "phone_only") return "verified";
  if (action === "save-profile" && current === "verified") return "profile_complete";
  if (action === "choose-role" && current === "profile_complete") return "role_selected";
  if (action === "choose-role" && current === "role_selected") return "complete";
  return current;
}

export interface ProfileStore {
  getOnboardingState(userId: string): Promise<string>;
  updateProfile(
    userId: string,
    patch: { fullName?: string; avatarPublicId?: string; onboardingState?: string },
  ): Promise<void>;
}

export function memoryProfileStore(
  initial: Record<string, { onboardingState: string }> = {},
): ProfileStore & { rows: Record<string, { onboardingState: string }> } {
  const rows: Record<string, { onboardingState: string }> = { ...initial };
  return {
    rows,
    async getOnboardingState(userId: string): Promise<string> {
      return rows[userId]?.onboardingState ?? "phone_only";
    },
    async updateProfile(
      userId: string,
      patch: { fullName?: string; avatarPublicId?: string; onboardingState?: string },
    ): Promise<void> {
      const row = rows[userId] ?? { onboardingState: "phone_only" };
      rows[userId] = {
        onboardingState: patch.onboardingState ?? row.onboardingState,
      };
    },
  };
}

export function supabaseProfileStore(client: SupabaseClient): ProfileStore {
  return {
    async getOnboardingState(userId: string): Promise<string> {
      const { data, error } = await client
        .from("profiles")
        .select("onboarding_state")
        .eq("id", userId)
        .single();
      if (error || !data) throw new Error("profile not found");
      return data.onboarding_state as string;
    },
    async updateProfile(
      userId: string,
      patch: { fullName?: string; avatarPublicId?: string; onboardingState?: string },
    ): Promise<void> {
      const { error } = await client
        .from("profiles")
        .update({
          ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
          ...(patch.avatarPublicId !== undefined ? { avatar_public_id: patch.avatarPublicId } : {}),
          ...(patch.onboardingState !== undefined
            ? { onboarding_state: patch.onboardingState }
            : {}),
        })
        .eq("id", userId);
      if (error) throw new Error(`profile update failed: ${error.message}`);
    },
  };
}

export async function advanceOnboarding(
  store: ProfileStore,
  userId: string,
  action: OnboardingAction,
  patch?: { fullName?: string; avatarPublicId?: string },
): Promise<string> {
  const current = await store.getOnboardingState(userId);
  const next = nextOnboardingState(current, action);
  if (next !== current) {
    await store.updateProfile(userId, { ...patch, onboardingState: next });
  } else if (patch && (patch.fullName !== undefined || patch.avatarPublicId !== undefined)) {
    await store.updateProfile(userId, patch);
  }
  return next;
}
