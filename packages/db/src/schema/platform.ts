// platform.ts — public tables for the platform area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  inet,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { webhookProviderEnum, webhookStatusEnum } from "../enums.ts";

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    provider: webhookProviderEnum("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureValid: boolean("signature_valid").default(false).notNull(),
    status: webhookStatusEnum("status").default("received").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    headers: jsonb("headers").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    lastError: text("last_error"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    processingAt: timestamp("processing_at", { withTimezone: true, mode: "date" }),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [unique("webhook_events_provider_event_id_key").on(table.provider, table.eventId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    userId: uuid("user_id"),
    requestFingerprint: text("request_fingerprint").notNull(),
    responseStatus: smallint("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
      .default(sql`(now() + '24:00:00'::interval)`)
      .notNull(),
  },
  (table) => [unique("idempotency_keys_scope_key_key").on(table.scope, table.key)],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    publishAttempts: smallint("publish_attempts").default(0).notNull(),
    lastError: text("last_error"),
  },
  (table) => [
    unique("outbox_events_event_type_aggregate_id_occurred_at_key").on(
      table.eventType,
      table.aggregateId,
      table.occurredAt,
    ),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().notNull(),
  actorId: uuid("actor_id"),
  actorRole: text("actor_role").default("system").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  changedKeys: text("changed_keys").array(),
  ip: inet("ip"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  jobName: text("job_name").notNull(),
  runId: text("run_id").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  durationMs: integer("duration_ms"),
  itemsProcessed: integer("items_processed").default(0).notNull(),
  itemsFailed: integer("items_failed").default(0).notNull(),
  summary: jsonb("summary").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  error: text("error"),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey().notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  reason: text("reason"),
  updatedBy: uuid("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
