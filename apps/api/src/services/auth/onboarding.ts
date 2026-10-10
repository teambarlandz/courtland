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

export interface ProfileData {
  onboardingState: string;
  fullName: string | null;
  avatarPublicId: string | null;
  phoneE164: string | null;
}

export interface ProfileStore {
  getOnboardingState(userId: string): Promise<string>;
  getProfile(userId: string): Promise<ProfileData | null>;
  updateProfile(
    userId: string,
    patch: {
      fullName?: string;
      avatarPublicId?: string;
      phoneE164?: string;
      onboardingState?: string;
    },
  ): Promise<void>;
}

export function memoryProfileStore(
  initial: Record<string, Partial<ProfileData>> = {},
): ProfileStore & { rows: Record<string, ProfileData> } {
  const rows: Record<string, ProfileData> = {};
  for (const [id, row] of Object.entries(initial)) {
    rows[id] = {
      onboardingState: row.onboardingState ?? "phone_only",
      fullName: row.fullName ?? null,
      avatarPublicId: row.avatarPublicId ?? null,
      phoneE164: row.phoneE164 ?? null,
    };
  }
  return {
    rows,
    async getOnboardingState(userId: string): Promise<string> {
      return rows[userId]?.onboardingState ?? "phone_only";
    },
    async getProfile(userId: string): Promise<ProfileData | null> {
      return rows[userId] ?? null;
    },
    async updateProfile(
      userId: string,
      patch: {
        fullName?: string;
        avatarPublicId?: string;
        phoneE164?: string;
        onboardingState?: string;
      },
    ): Promise<void> {
      const row = rows[userId] ?? {
        onboardingState: "phone_only",
        fullName: null,
        avatarPublicId: null,
        phoneE164: null,
      };
      rows[userId] = {
        onboardingState: patch.onboardingState ?? row.onboardingState,
        fullName: patch.fullName ?? row.fullName,
        avatarPublicId: patch.avatarPublicId ?? row.avatarPublicId,
        phoneE164: patch.phoneE164 ?? row.phoneE164,
      };
    },
  };
}

export function supabaseProfileStore(client: SupabaseClient): ProfileStore {
  return {
    async getOnboardingState(userId: string): Promise<string> {
      const profile = await this.getProfile(userId);
      return profile?.onboardingState ?? "phone_only";
    },
    async getProfile(userId: string): Promise<ProfileData | null> {
      const { data, error } = await client
        .from("profiles")
        .select("onboarding_state, full_name, avatar_public_id, phone_e164")
        .eq("id", userId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as {
        onboarding_state: string;
        full_name: string | null;
        avatar_public_id: string | null;
        phone_e164: string | null;
      };
      return {
        onboardingState: row.onboarding_state,
        fullName: row.full_name,
        avatarPublicId: row.avatar_public_id,
        phoneE164: row.phone_e164,
      };
    },
    async updateProfile(
      userId: string,
      patch: {
        fullName?: string;
        avatarPublicId?: string;
        phoneE164?: string;
        onboardingState?: string;
      },
    ): Promise<void> {
      const { error } = await client
        .from("profiles")
        .update({
          ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
          ...(patch.avatarPublicId !== undefined ? { avatar_public_id: patch.avatarPublicId } : {}),
          ...(patch.phoneE164 !== undefined ? { phone_e164: patch.phoneE164 } : {}),
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
