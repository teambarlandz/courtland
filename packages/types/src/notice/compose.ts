// notice/compose.ts — ad-hoc notice composition (docs/08 §10 POST /v1/notices).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { NoticeChannel, NoticeKind } from "../common/enums.ts";

export const NoticeCompose = z.strictObject({
  kind: NoticeKind,
  channel: NoticeChannel,
  recipientUserId: z.uuid().optional(),
  recipientAddress: z.string().min(1).max(300),
  recipientName: z.string().max(200).optional(),
  templateKey: z.string().min(1).max(200),
  scheduledFor: DateTimeZ.optional(),
  contractId: z.uuid().optional(),
  unitId: z.uuid().optional(),
});
export type NoticeCompose = z.infer<typeof NoticeCompose>;
