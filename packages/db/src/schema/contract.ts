// contract.ts — public tables for the contract area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  citext,
  contractKindEnum,
  contractStatusEnum,
  lateFeePolicyEnum,
  occupancyRelationshipEnum,
  partyRoleEnum,
  paymentPlanEnum,
  scheduleKindEnum,
  scheduleStatusEnum,
  titleReleaseStatusEnum,
} from "../enums.ts";

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  kind: contractKindEnum("kind").notNull(),
  reference: text("reference").unique().notNull(),
  propertyId: uuid("property_id").notNull(),
  unitId: uuid("unit_id"),
  ownerId: uuid("owner_id").notNull(),
  primaryPayerId: uuid("primary_payer_id").notNull(),
  status: contractStatusEnum("status").default("draft").notNull(),
  suspensionReason: text("suspension_reason"),
  startDate: date("start_date", { mode: "date" }),
  endDate: date("end_date", { mode: "date" }),
  activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
  terminatedAt: timestamp("terminated_at", { withTimezone: true, mode: "date" }),
  terminationReason: text("termination_reason"),
  expiredAt: timestamp("expired_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  currency: text("currency").default("NGN").notNull(),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
  outstandingKobo: bigint("outstanding_kobo", { mode: "number" }).notNull(),
  balanceReconciledAt: timestamp("balance_reconciled_at", { withTimezone: true, mode: "date" }),
  rentKobo: bigint("rent_kobo", { mode: "number" }),
  rentCadenceMonths: smallint("rent_cadence_months"),
  serviceChargeKobo: bigint("service_charge_kobo", { mode: "number" }),
  securityDepositKobo: bigint("security_deposit_kobo", { mode: "number" }),
  agreementFeeKobo: bigint("agreement_fee_kobo", { mode: "number" }),
  lateFeePolicy: lateFeePolicyEnum("late_fee_policy").default("none").notNull(),
  lateFeeValue: bigint("late_fee_value", { mode: "number" }).default(0).notNull(),
  graceDays: smallint("grace_days").default(3).notNull(),
  paymentPlan: paymentPlanEnum("payment_plan"),
  installmentCount: smallint("installment_count"),
  installmentAmountKobo: bigint("installment_amount_kobo", { mode: "number" }),
  installmentDayOfMonth: smallint("installment_day_of_month"),
  titleReleaseStatus: titleReleaseStatusEnum("title_release_status")
    .default("not_eligible")
    .notNull(),
  allocationId: uuid("allocation_id"),
  agreementDocumentId: uuid("agreement_document_id"),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const contractParties = pgTable(
  "contract_parties",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    contractId: uuid("contract_id").notNull(),
    userId: uuid("user_id"),
    partyName: text("party_name").notNull(),
    partyRole: partyRoleEnum("party_role").notNull(),
    email: citext("email"),
    phoneE164: text("phone_e164"),
    nationality: text("nationality"),
    address: text("address"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true, mode: "date" }),
    signatureDocumentId: uuid("signature_document_id"),
    addedAt: timestamp("added_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("contract_parties_contract_id_party_role_party_name_key").on(
      table.contractId,
      table.partyRole,
      table.partyName,
    ),
  ],
);

export const contractSchedule = pgTable(
  "contract_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    contractId: uuid("contract_id").notNull(),
    seq: smallint("seq").notNull(),
    kind: scheduleKindEnum("kind").notNull(),
    dueDate: date("due_date", { mode: "date" }).notNull(),
    amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
    paidKobo: bigint("paid_kobo", { mode: "number" }).default(0).notNull(),
    status: scheduleStatusEnum("status").default("pending").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    waivedBy: uuid("waived_by"),
    waiverReason: text("waiver_reason"),
    paymentIntentId: uuid("payment_intent_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("contract_schedule_contract_id_seq_key").on(table.contractId, table.seq)],
);

export const contractEvents = pgTable("contract_events", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  eventType: text("event_type").notNull(),
  fromStatus: contractStatusEnum("from_status"),
  toStatus: contractStatusEnum("to_status"),
  actorId: uuid("actor_id"),
  actorRole: text("actor_role").notNull(),
  note: text("note"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const unitOccupancies = pgTable("unit_occupancies", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  unitId: uuid("unit_id").notNull(),
  contractId: uuid("contract_id"),
  personName: text("person_name").notNull(),
  userId: uuid("user_id"),
  relationship: occupancyRelationshipEnum("relationship").default("primary").notNull(),
  movedIn: date("moved_in", { mode: "date" }).default(sql`CURRENT_DATE`).notNull(),
  movedOut: date("moved_out", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
