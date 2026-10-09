// document/document.ts — documents (DB documents).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import {
  DocumentKind,
  DocumentOrigin,
  DocumentStatus,
  DocumentVisibility,
} from "../common/enums.ts";

export const Document = z.strictObject({
  id: z.uuid(),
  reference: z.string(),
  origin: DocumentOrigin,
  kind: DocumentKind,
  visibility: DocumentVisibility,
  status: DocumentStatus,
  contractId: z.uuid().nullable(),
  propertyId: z.uuid().nullable(),
  ownerId: z.uuid().nullable(),
  title: z.string(),
  storagePublicId: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nullable(),
  version: z.number().int().min(1),
  supersedesDocumentId: z.uuid().nullable(),
  issuedAt: DateTimeZ.nullable(),
  releasedAt: DateTimeZ.nullable(),
});
export type Document = z.infer<typeof Document>;

export const DocumentGenerate = z.strictObject({
  kind: DocumentKind,
  contractId: z.uuid().optional(),
  propertyId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  title: z.string().min(1).max(300),
  templateKey: z.string().optional(),
  templateVersion: z.number().int().min(1).optional(),
});
export type DocumentGenerate = z.infer<typeof DocumentGenerate>;
