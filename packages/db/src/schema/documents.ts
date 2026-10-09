// documents.ts — public tables for the documents area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import { bigint, inet, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  documentKindEnum,
  documentOriginEnum,
  documentStatusEnum,
  documentVisibilityEnum,
} from "../enums.ts";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  reference: text("reference").unique().notNull(),
  origin: documentOriginEnum("origin").default("generated").notNull(),
  kind: documentKindEnum("kind").notNull(),
  visibility: documentVisibilityEnum("visibility").default("private").notNull(),
  status: documentStatusEnum("status").default("draft").notNull(),
  contractId: uuid("contract_id"),
  propertyId: uuid("property_id"),
  ownerId: uuid("owner_id"),
  ownerUserId: uuid("owner_user_id"),
  title: text("title").notNull(),
  storagePublicId: text("storage_public_id").unique(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").default("application/pdf").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }),
  pageCount: smallint("page_count"),
  checksumSha256: text("checksum_sha256"),
  templateKey: text("template_key"),
  templateVersion: smallint("template_version"),
  renderedData: jsonb("rendered_data")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  version: smallint("version").default(1).notNull(),
  supersedesDocumentId: uuid("supersedes_document_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  releaseApprovedBy: uuid("release_approved_by"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const documentAccessLog = pgTable("document_access_log", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  documentId: uuid("document_id").notNull(),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
