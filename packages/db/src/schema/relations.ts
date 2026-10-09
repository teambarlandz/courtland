// relations.ts — every public-to-public foreign key as Drizzle relations.
// Foreign keys to auth.users are plain uuid columns: auth.users is owned by
// GoTrue, not by our migrations, so no table is declared for it. Column parity
// with information_schema is enforced by test/schema-parity/test.ts.
import { relations } from "drizzle-orm/relations";
import { landDetails, owners, properties, propertyMedia, saleAllocations, units } from "./asset.ts";
import {
  contractEvents,
  contractParties,
  contractSchedule,
  contracts,
  unitOccupancies,
} from "./contract.ts";
import { documentAccessLog, documents } from "./documents.ts";
import {
  ledgerAllocations,
  paymentIntents,
  paymentsLedger,
  payouts,
  paystackAccounts,
  refundAllocations,
  refunds,
} from "./money.ts";
import { disputes, maintenanceTickets, notices, ticketUpdates } from "./ops.ts";

export const ownersRelations = relations(owners, ({ many }) => ({
  contracts: many(contracts),
  documents: many(documents),
  ledgerAllocations: many(ledgerAllocations),
  paymentsLedger: many(paymentsLedger),
  payouts: many(payouts),
  paystackAccounts: many(paystackAccounts),
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  owner: one(owners, { fields: [properties.ownerId], references: [owners.id] }),
  contracts: many(contracts),
  disputes: many(disputes),
  documents: many(documents),
  landDetails: many(landDetails),
  maintenanceTickets: many(maintenanceTickets),
  propertyMedia: many(propertyMedia),
  saleAllocations: many(saleAllocations),
  units: many(units),
}));

export const propertyMediaRelations = relations(propertyMedia, ({ one }) => ({
  property: one(properties, { fields: [propertyMedia.propertyId], references: [properties.id] }),
}));

export const landDetailsRelations = relations(landDetails, ({ one }) => ({
  property: one(properties, { fields: [landDetails.propertyId], references: [properties.id] }),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  currentContract: one(contracts, {
    fields: [units.currentContractId],
    references: [contracts.id],
    relationName: "unitCurrentContract",
  }),
  property: one(properties, { fields: [units.propertyId], references: [properties.id] }),
  contractsAsUnit: many(contracts, { relationName: "contractUnit" }),
  disputes: many(disputes),
  maintenanceTickets: many(maintenanceTickets),
  notices: many(notices),
  unitOccupancies: many(unitOccupancies),
}));

export const saleAllocationsRelations = relations(saleAllocations, ({ one, many }) => ({
  property: one(properties, { fields: [saleAllocations.propertyId], references: [properties.id] }),
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  saleAllocation: one(saleAllocations, {
    fields: [contracts.allocationId],
    references: [saleAllocations.id],
  }),
  owner: one(owners, { fields: [contracts.ownerId], references: [owners.id] }),
  property: one(properties, { fields: [contracts.propertyId], references: [properties.id] }),
  unit: one(units, {
    fields: [contracts.unitId],
    references: [units.id],
    relationName: "contractUnit",
  }),
  contractEvents: many(contractEvents),
  contractParties: many(contractParties),
  contractSchedule: many(contractSchedule),
  disputes: many(disputes),
  documents: many(documents),
  notices: many(notices),
  paymentIntents: many(paymentIntents),
  paymentsLedger: many(paymentsLedger),
  unitOccupancies: many(unitOccupancies),
  unitsWithCurrent: many(units, { relationName: "unitCurrentContract" }),
}));

export const contractPartiesRelations = relations(contractParties, ({ one }) => ({
  contract: one(contracts, { fields: [contractParties.contractId], references: [contracts.id] }),
  document: one(documents, {
    fields: [contractParties.signatureDocumentId],
    references: [documents.id],
  }),
}));

export const contractScheduleRelations = relations(contractSchedule, ({ one, many }) => ({
  contract: one(contracts, { fields: [contractSchedule.contractId], references: [contracts.id] }),
  paymentIntents: many(paymentIntents),
}));

export const contractEventsRelations = relations(contractEvents, ({ one }) => ({
  contract: one(contracts, { fields: [contractEvents.contractId], references: [contracts.id] }),
}));

export const unitOccupanciesRelations = relations(unitOccupancies, ({ one }) => ({
  contract: one(contracts, { fields: [unitOccupancies.contractId], references: [contracts.id] }),
  unit: one(units, { fields: [unitOccupancies.unitId], references: [units.id] }),
}));

export const paymentIntentsRelations = relations(paymentIntents, ({ one, many }) => ({
  contract: one(contracts, { fields: [paymentIntents.contractId], references: [contracts.id] }),
  schedule: one(contractSchedule, {
    fields: [paymentIntents.scheduleId],
    references: [contractSchedule.id],
  }),
  paymentsLedger: many(paymentsLedger),
}));

export const paymentsLedgerRelations = relations(paymentsLedger, ({ one, many }) => ({
  contract: one(contracts, { fields: [paymentsLedger.contractId], references: [contracts.id] }),
  paymentIntent: one(paymentIntents, {
    fields: [paymentsLedger.intentId],
    references: [paymentIntents.id],
  }),
  owner: one(owners, { fields: [paymentsLedger.ownerId], references: [owners.id] }),
  ledgerAllocations: many(ledgerAllocations),
  refunds: many(refunds),
}));

export const ledgerAllocationsRelations = relations(ledgerAllocations, ({ one, many }) => ({
  maintenanceTicket: one(maintenanceTickets, {
    fields: [ledgerAllocations.deductionSourceTicketId],
    references: [maintenanceTickets.id],
  }),
  owner: one(owners, { fields: [ledgerAllocations.ownerId], references: [owners.id] }),
  payment: one(paymentsLedger, {
    fields: [ledgerAllocations.paymentId],
    references: [paymentsLedger.id],
  }),
  payout: one(payouts, { fields: [ledgerAllocations.payoutId], references: [payouts.id] }),
  refundAllocations: many(refundAllocations),
}));

export const payoutsRelations = relations(payouts, ({ one, many }) => ({
  owner: one(owners, { fields: [payouts.ownerId], references: [owners.id] }),
  ledgerAllocations: many(ledgerAllocations),
}));

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  payment: one(paymentsLedger, { fields: [refunds.paymentId], references: [paymentsLedger.id] }),
  refundAllocations: many(refundAllocations),
}));

export const refundAllocationsRelations = relations(refundAllocations, ({ one }) => ({
  allocation: one(ledgerAllocations, {
    fields: [refundAllocations.allocationId],
    references: [ledgerAllocations.id],
  }),
  refund: one(refunds, { fields: [refundAllocations.refundId], references: [refunds.id] }),
}));

export const paystackAccountsRelations = relations(paystackAccounts, ({ one }) => ({
  owner: one(owners, { fields: [paystackAccounts.ownerId], references: [owners.id] }),
}));

export const maintenanceTicketsRelations = relations(maintenanceTickets, ({ one, many }) => ({
  property: one(properties, {
    fields: [maintenanceTickets.propertyId],
    references: [properties.id],
  }),
  unit: one(units, { fields: [maintenanceTickets.unitId], references: [units.id] }),
  ledgerAllocations: many(ledgerAllocations),
  ticketUpdates: many(ticketUpdates),
}));

export const ticketUpdatesRelations = relations(ticketUpdates, ({ one }) => ({
  maintenanceTicket: one(maintenanceTickets, {
    fields: [ticketUpdates.ticketId],
    references: [maintenanceTickets.id],
  }),
}));

export const noticesRelations = relations(notices, ({ one }) => ({
  contract: one(contracts, { fields: [notices.contractId], references: [contracts.id] }),
  unit: one(units, { fields: [notices.unitId], references: [units.id] }),
}));

export const disputesRelations = relations(disputes, ({ one }) => ({
  contract: one(contracts, { fields: [disputes.contractId], references: [contracts.id] }),
  property: one(properties, { fields: [disputes.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [disputes.unitId], references: [units.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  contract: one(contracts, { fields: [documents.contractId], references: [contracts.id] }),
  owner: one(owners, { fields: [documents.ownerId], references: [owners.id] }),
  property: one(properties, { fields: [documents.propertyId], references: [properties.id] }),
  supersedes: one(documents, {
    fields: [documents.supersedesDocumentId],
    references: [documents.id],
    relationName: "supersession",
  }),
  contractParties: many(contractParties),
  documentAccessLog: many(documentAccessLog),
  supersededBy: many(documents, { relationName: "supersession" }),
}));

export const documentAccessLogRelations = relations(documentAccessLog, ({ one }) => ({
  document: one(documents, { fields: [documentAccessLog.documentId], references: [documents.id] }),
}));
