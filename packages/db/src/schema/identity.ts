// identity.ts — public tables for the identity area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { appRoleEnum, citext, kycStatusEnum, onboardingStateEnum } from "../enums.ts";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().notNull(),
  fullName: text("full_name"),
  email: citext("email"),
  phoneE164: text("phone_e164").unique(),
  avatarPublicId: text("avatar_public_id"),
  onboardingState: onboardingStateEnum("onboarding_state").default("phone_only").notNull(),
  kycStatus: kycStatusEnum("kyc_status").default("not_started").notNull(),
  kycNotes: text("kyc_notes"),
  kycReviewedBy: uuid("kyc_reviewed_by"),
  kycReviewedAt: timestamp("kyc_reviewed_at", { withTimezone: true, mode: "date" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id").notNull(),
    role: appRoleEnum("role").notNull(),
    grantedBy: uuid("granted_by"),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: appRoleEnum("role").notNull(),
    permission: text("permission").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.role, table.permission] })],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    alertsOn: boolean("alerts_on").default(false).notNull(),
    lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("saved_searches_user_id_name_key").on(table.userId, table.name)],
);

export const adminFilterViews = pgTable("admin_filter_views", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  ownerId: uuid("owner_id"),
  name: text("name").notNull(),
  entity: text("entity").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  columns: text("columns").array().default(sql`'{}'::text[]`).notNull(),
  isShared: boolean("is_shared").default(false).notNull(),
  sort: jsonb("sort").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
