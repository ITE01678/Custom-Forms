/** kebab-case title + a short random suffix, e.g. "Team Outing" -> "team-outing-8f3k". */
export function slugify(title: string): string {
  const kebab = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${kebab || "form"}-${suffix}`;
}
