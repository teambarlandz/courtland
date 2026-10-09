// common/pagination.ts — collection envelope and list query (docs/08 §4.2, §4.3, §9).
// meta.count is the size of the current page, NOT a total. Cursors are opaque.
import { z } from "zod";

export const PageMeta = z.strictObject({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  count: z.number().int().min(0),
});
export type PageMeta = z.infer<typeof PageMeta>;

export function pageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({
    data: z.array(item),
    meta: PageMeta,
  });
}

export const ListQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.string().optional(),
  sort: z.string().optional(),
  q: z.string().optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;

export function dataOf<T extends z.ZodType>(item: T) {
  return z.strictObject({ data: item });
}
