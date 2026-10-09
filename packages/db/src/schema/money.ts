// money.ts — public tables for the money area. Mirrors the SQL migrations column for column.
// The migrations are the DDL source of truth; this file exists so TypeScript
// queries are typed. Referential structure lives in relations.ts (this file
// declares no .references(), so the seven schema modules stay cycle-free).
// Column parity with information_schema is enforced by test/schema-parity/test.ts.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  allocationBasisEnum,
  allocationStatusEnum,
  beneficiaryTypeEnum,
  ledgerStatusEnum,
  paymentChannelEnum,
  paymentIntentStatusEnum,
  paymentKindEnum,
  payoutMethodEnum,
  payoutStatusEnum,
} from "../enums.ts";

export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  scheduleId: uuid("schedule_id"),
  payerId: uuid("payer_id").notNull(),
  kind: paymentKindEnum("kind").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN").notNull(),
  status: paymentIntentStatusEnum("status").default("created").notNull(),
  dueDate: date("due_date", { mode: "date" }),
  periodStart: date("period_start", { mode: "date" }),
  periodEnd: date("period_end", { mode: "date" }),
  description: text("description"),
  paystackReference: text("paystack_reference").unique(),
  paystackAccessCode: text("paystack_access_code"),
  authorizationCode: text("authorization_code"),
  authorizationReusable: boolean("authorization_reusable").default(false).notNull(),
  splitSnapshot: jsonb("split_snapshot").$type<Record<string, unknown>>(),
  providerMetadata: jsonb("provider_metadata")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  idempotencyKey: text("idempotency_key"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
    .default(sql`(now() + '24:00:00'::interval)`)
    .notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const paymentsLedger = pgTable("payments_ledger", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  reference: text("reference").unique().notNull(),
  intentId: uuid("intent_id").notNull(),
  contractId: uuid("contract_id").notNull(),
  payerId: uuid("payer_id").notNull(),
  ownerId: uuid("owner_id").notNull(),
  kind: paymentKindEnum("kind").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  paystackFeeKobo: bigint("paystack_fee_kobo", { mode: "number" }).default(0).notNull(),
  netKobo: bigint("net_kobo", { mode: "number" }).generatedAlwaysAs(
    sql`amount_kobo - paystack_fee_kobo`,
  ),
  currency: text("currency").default("NGN").notNull(),
  status: ledgerStatusEnum("status").default("pending").notNull(),
  channel: paymentChannelEnum("channel"),
  paystackReference: text("paystack_reference").unique().notNull(),
  paystackEventId: text("paystack_event_id"),
  paystackAuthorizationCode: text("paystack_authorization_code"),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }),
  reversalReason: text("reversal_reason"),
  refundedKobo: bigint("refunded_kobo", { mode: "number" }).default(0).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const ledgerAllocations = pgTable("ledger_allocations", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  paymentId: uuid("payment_id").notNull(),
  beneficiaryType: beneficiaryTypeEnum("beneficiary_type").notNull(),
  ownerId: uuid("owner_id"),
  basis: allocationBasisEnum("basis").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  status: allocationStatusEnum("status").default("pending").notNull(),
  isPayable: boolean("is_payable").default(true).notNull(),
  paystackSubaccountCode: text("paystack_subaccount_code"),
  payoutId: uuid("payout_id"),
  settlementBatch: text("settlement_batch"),
  settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  deductionSourceTicketId: uuid("deduction_source_ticket_id"),
});

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  reference: text("reference").unique().notNull(),
  ownerId: uuid("owner_id").notNull(),
  periodStart: date("period_start", { mode: "date" }).notNull(),
  periodEnd: date("period_end", { mode: "date" }).notNull(),
  currency: text("currency").default("NGN").notNull(),
  grossKobo: bigint("gross_kobo", { mode: "number" }).notNull(),
  deductionsKobo: bigint("deductions_kobo", { mode: "number" }).default(0).notNull(),
  carryForwardKobo: bigint("carry_forward_kobo", { mode: "number" }).default(0).notNull(),
  netKobo: bigint("net_kobo", { mode: "number" }).notNull(),
  status: payoutStatusEnum("status").default("draft").notNull(),
  method: payoutMethodEnum("method").default("paystack_transfer").notNull(),
  paystackSubaccountCode: text("paystack_subaccount_code"),
  paystackTransferReference: text("paystack_transfer_reference"),
  allocationCount: integer("allocation_count").default(0).notNull(),
  initiatedBy: uuid("initiated_by"),
  initiatedAt: timestamp("initiated_at", { withTimezone: true, mode: "date" }),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  failureReason: text("failure_reason"),
  statementDocumentId: uuid("statement_document_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  paymentId: uuid("payment_id").notNull(),
  requestedBy: uuid("requested_by").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(),
  paystackRefundId: text("paystack_refund_id").unique(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const refundAllocations = pgTable(
  "refund_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    refundId: uuid("refund_id").notNull(),
    allocationId: uuid("allocation_id").notNull(),
    amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("refund_allocations_refund_id_allocation_id_key").on(table.refundId, table.allocationId),
  ],
);

export const paystackAccounts = pgTable("paystack_accounts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  ownerId: uuid("owner_id").unique().notNull(),
  subaccountCode: text("subaccount_code").unique().notNull(),
  paystackSubaccountId: text("paystack_subaccount_id"),
  businessName: text("business_name").notNull(),
  settlementBank: text("settlement_bank").notNull(),
  accountNumber: text("account_number").notNull(),
  percentageChargeBps: integer("percentage_charge_bps").default(0).notNull(),
  settlementSchedule: text("settlement_schedule").default("auto").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
