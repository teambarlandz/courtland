// ops.ts — public tables for the ops area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import { bigint, boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  disputeStatusEnum,
  noticeChannelEnum,
  noticeKindEnum,
  noticeStatusEnum,
  ticketPriorityEnum,
  ticketStatusEnum,
  ticketVisibilityEnum,
} from "../enums.ts";

export const maintenanceTickets = pgTable("maintenance_tickets", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  reference: text("reference").unique().notNull(),
  propertyId: uuid("property_id").notNull(),
  unitId: uuid("unit_id"),
  raisedBy: uuid("raised_by").notNull(),
  assignedTo: uuid("assigned_to"),
  category: text("category").notNull(),
  priority: ticketPriorityEnum("priority").default("medium").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").default("open").notNull(),
  permissionToEnter: boolean("permission_to_enter").default(false).notNull(),
  quotedAmountKobo: bigint("quoted_amount_kobo", { mode: "number" }),
  costApprovedBy: uuid("cost_approved_by"),
  costApprovedAt: timestamp("cost_approved_at", { withTimezone: true, mode: "date" }),
  contractorName: text("contractor_name"),
  contractorPhoneE164: text("contractor_phone_e164"),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const ticketUpdates = pgTable("ticket_updates", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  ticketId: uuid("ticket_id").notNull(),
  authorId: uuid("author_id").notNull(),
  body: text("body").notNull(),
  visibility: ticketVisibilityEnum("visibility").default("shared").notNull(),
  attachmentPublicId: text("attachment_public_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  kind: noticeKindEnum("kind").notNull(),
  channel: noticeChannelEnum("channel").notNull(),
  recipientUserId: uuid("recipient_user_id"),
  recipientAddress: text("recipient_address").notNull(),
  recipientName: text("recipient_name"),
  templateKey: text("template_key").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  status: noticeStatusEnum("status").default("queued").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  providerMessageId: text("provider_message_id"),
  provider: text("provider"),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
  failureReason: text("failure_reason"),
  dedupeKey: text("dedupe_key").unique().notNull(),
  contractId: uuid("contract_id"),
  unitId: uuid("unit_id"),
  relatedEntity: text("related_entity"),
  relatedId: uuid("related_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  reference: text("reference").unique().notNull(),
  contractId: uuid("contract_id"),
  propertyId: uuid("property_id"),
  unitId: uuid("unit_id"),
  raisedBy: uuid("raised_by").notNull(),
  againstUserId: uuid("against_user_id"),
  category: text("category").notNull(),
  description: text("description").notNull(),
  status: disputeStatusEnum("status").default("open").notNull(),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
