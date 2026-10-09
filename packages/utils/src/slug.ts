// slug.ts — URL slugs (DB properties.slug unique).
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new Error("slug would be empty");
  return slug;
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
