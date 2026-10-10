// routes/admin/users.ts — staff accounts, roles, invite, suspend (docs/08 §10).
// All data access runs through the injected admin service (service-role).
// Tests script the memory fake; server.ts wires the GoTrue adapter.

import { AdminUserRolesPatch } from "@courtland/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.ts";
import type { AuthVerifier } from "../../middleware/auth.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requirePermission } from "../../middleware/requirePermission.ts";
import { validate } from "../../middleware/validate.ts";
import type { GoTrueAdmin } from "../../services/admin/users.ts";
import { supabaseGoTrueAdmin } from "../../services/admin/users.ts";

interface AdminUsersRouteDeps {
  verifier: AuthVerifier;
  admin: GoTrueAdmin;
}

export function createAdminUsersRoutes(deps: AdminUsersRouteDeps) {
  const router = Router();
  const staff = [authenticate(deps.verifier), requirePermission("user_manage")];
  const IdParams = z.strictObject({ id: z.uuid() });

  router.get("/", ...staff, async (_req, res, next) => {
    try {
      const users = await deps.admin.listUsers();
      res.json({
        data: users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          phoneE164: u.phone ?? null,
          fullName: null,
          roles: [],
        })),
        meta: { nextCursor: null, hasMore: false, count: users.length },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/invite", ...staff, async (req, res, next) => {
    try {
      const { email } = req.body as { email?: unknown };
      if (typeof email !== "string" || !email.includes("@")) {
        throw new NotFoundError("A valid email is required to invite.");
      }
      const user = await deps.admin.inviteUser(email);
      res.status(201).json({ data: { id: user.id, email: user.email ?? null } });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/:id/roles",
    ...staff,
    validate({
      params: IdParams,
      body: AdminUserRolesPatch,
    }),
    async (req, res, next) => {
      try {
        const { roles } = AdminUserRolesPatch.parse(req.body);
        await deps.admin.setRoles(req.params.id as string, roles);
        res.json({ data: { id: req.params.id, roles } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/:id/suspend", ...staff, async (req, res, next) => {
    try {
      const user = await deps.admin.updateUser(req.params.id as string, { banned: true });
      res.json({ data: { id: user.id, banned: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function wireAdminUsersRoutes(admin: SupabaseClient, verifier: AuthVerifier) {
  return createAdminUsersRoutes({ verifier, admin: supabaseGoTrueAdmin(admin) });
}
