// contract/party.ts — contract parties (DB contract_parties).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { PartyRole } from "../common/enums.ts";

const NG_PHONE = /^\+234[0-9]{10}$/;

export const ContractParty = z.strictObject({
  id: z.uuid(),
  contractId: z.uuid(),
  userId: z.uuid().nullable(),
  partyName: z.string(),
  partyRole: PartyRole,
  email: z.string().nullable(),
  phoneE164: z.string().regex(NG_PHONE).nullable(),
  isPrimary: z.boolean(),
  signedAt: DateTimeZ.nullable(),
});
export type ContractParty = z.infer<typeof ContractParty>;

export const ContractPartyCreate = z.strictObject({
  userId: z.uuid().optional(),
  partyName: z.string().min(1).max(200),
  partyRole: PartyRole,
  email: z.email().optional(),
  phoneE164: z.string().regex(NG_PHONE).optional(),
  isPrimary: z.boolean().default(false),
});
export type ContractPartyCreate = z.infer<typeof ContractPartyCreate>;
