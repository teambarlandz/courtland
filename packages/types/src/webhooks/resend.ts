// webhooks/resend.ts — Resend (Svix) event webhook (docs/13 §5.1, 01 §B3).
// Documented events drive notices.status; unknown types pass through and
// return 200. Loose objects for provider evolution (see paystack.ts).
import { z } from "zod";

export const ResendEventBody = z.looseObject({
  type: z.string(),
  data: z.looseObject({
    email_id: z.string().optional(),
    from: z.string().optional(),
    to: z.union([z.string(), z.array(z.string())]).optional(),
    subject: z.string().optional(),
    created_at: z.string().optional(),
  }),
});
export type ResendEventBody = z.infer<typeof ResendEventBody>;

export const EmailBounced = z.looseObject({
  type: z.literal("email.bounced"),
  data: z.looseObject({
    email_id: z.string().optional(),
    from: z.string().optional(),
    to: z.union([z.string(), z.array(z.string())]).optional(),
  }),
});

export const EmailComplained = z.looseObject({
  type: z.literal("email.complained"),
  data: z.looseObject({
    email_id: z.string().optional(),
  }),
});

export const ResendWebhook = z.union([EmailBounced, EmailComplained, ResendEventBody]);
export type ResendWebhook = z.infer<typeof ResendWebhook>;
