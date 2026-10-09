// notice/notice.ts — notices (DB notices).
import { z } from "zod";
import { DateTimeZ } from "../common/dates.ts";
import { NoticeChannel, NoticeKind, NoticeStatus } from "../common/enums.ts";

export const Notice = z.strictObject({
  id: z.uuid(),
  kind: NoticeKind,
  channel: NoticeChannel,
  recipientUserId: z.uuid().nullable(),
  recipientAddress: z.string(),
  recipientName: z.string().nullable(),
  templateKey: z.string(),
  status: NoticeStatus,
  scheduledFor: DateTimeZ,
  sentAt: DateTimeZ.nullable(),
  deliveredAt: DateTimeZ.nullable(),
  failureReason: z.string().nullable(),
  dedupeKey: z.string(),
});
export type Notice = z.infer<typeof Notice>;
