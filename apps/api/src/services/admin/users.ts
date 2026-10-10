// services/admin/users.ts — staff user administration (service-role).
// All calls run through the injected GoTrueAdmin so tests script a fake;
// the supabase adapter is a thin pass-through. Role writes go to user_roles
// (the RLS source of truth), suspension uses GoTrue bans.

import type { AppRole } from "@courtland/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminUserRecord {
  id: string;
  email?: string;
  phone?: string;
  banned?: boolean;
}

export interface GoTrueAdmin {
  listUsers(): Promise<AdminUserRecord[]>;
  inviteUser(email: string): Promise<AdminUserRecord>;
  updateUser(userId: string, patch: { banned?: boolean }): Promise<AdminUserRecord>;
  updatePhone(userId: string, phone: string): Promise<void>;
  signOut(token: string): Promise<void>;
  setRoles(userId: string, roles: AppRole[]): Promise<void>;
  getRoles(userId: string): Promise<AppRole[]>;
}

export function supabaseGoTrueAdmin(admin: SupabaseClient): GoTrueAdmin {
  return {
    async listUsers(): Promise<AdminUserRecord[]> {
      const { data, error } = await admin.auth.admin.listUsers();
      if (error) throw new Error(`list users failed: ${error.message}`);
      return data.users.map((u) => ({
        id: u.id,
        email: u.email ?? undefined,
        phone: u.phone ?? undefined,
      }));
    },
    async inviteUser(email: string): Promise<AdminUserRecord> {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error || !data.user) throw new Error(`invite failed: ${error?.message ?? "no user"}`);
      return { id: data.user.id, email: data.user.email ?? undefined };
    },
    async updateUser(userId: string, patch: { banned?: boolean }): Promise<AdminUserRecord> {
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: patch.banned === true ? "876000h" : "none",
      });
      if (error || !data.user) throw new Error(`update failed: ${error?.message ?? "no user"}`);
      return { id: data.user.id };
    },
    async updatePhone(userId: string, phone: string): Promise<void> {
      const { error } = await admin.auth.admin.updateUserById(userId, { phone });
      if (error) throw new Error(`phone update failed: ${error.message}`);
    },
    async signOut(token: string): Promise<void> {
      const { error } = await admin.auth.admin.signOut(token, "global");
      if (error) throw new Error(`sign out failed: ${error.message}`);
    },
    async setRoles(userId: string, roles: AppRole[]): Promise<void> {
      const { error: clearError } = await admin.from("user_roles").delete().eq("user_id", userId);
      if (clearError) throw new Error(`role clear failed: ${clearError.message}`);
      if (roles.length === 0) return;
      const { error } = await admin
        .from("user_roles")
        .insert(roles.map((role) => ({ user_id: userId, role })));
      if (error) throw new Error(`role set failed: ${error.message}`);
    },
    async getRoles(userId: string): Promise<AppRole[]> {
      const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw new Error(`role read failed: ${error.message}`);
      return (data as { role: AppRole }[]).map((r) => r.role);
    },
  };
}

export function memoryGoTrueAdmin(
  users: AdminUserRecord[] = [],
  roles: Record<string, AppRole[]> = {},
): GoTrueAdmin & {
  users: AdminUserRecord[];
  roles: Record<string, AppRole[]>;
  signedOut: string[];
} {
  const state = {
    users: users.map((u) => ({ ...u })),
    roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, [...v]])) as Record<
      string,
      AppRole[]
    >,
    signedOut: [] as string[],
  };
  return {
    users: state.users,
    roles: state.roles,
    signedOut: state.signedOut,
    async listUsers(): Promise<AdminUserRecord[]> {
      return state.users.map((u) => ({ ...u }));
    },
    async inviteUser(email: string): Promise<AdminUserRecord> {
      const user = { id: `user-${state.users.length + 1}`, email };
      state.users.push(user);
      return { ...user };
    },
    async updateUser(userId: string, patch: { banned?: boolean }): Promise<AdminUserRecord> {
      const user = state.users.find((u) => u.id === userId);
      if (!user) throw new Error("user not found");
      user.banned = patch.banned ?? user.banned;
      return { ...user };
    },
    async updatePhone(userId: string, phone: string): Promise<void> {
      const user = state.users.find((u) => u.id === userId);
      if (!user) throw new Error("user not found");
      user.phone = phone;
    },
    async signOut(token: string): Promise<void> {
      state.signedOut.push(token);
    },
    async setRoles(userId: string, next: AppRole[]): Promise<void> {
      state.roles[userId] = [...next];
    },
    async getRoles(userId: string): Promise<AppRole[]> {
      return [...(state.roles[userId] ?? [])];
    },
  };
}
