/**
 * Resolves a connector's `lookupKeyExpression` template — small `{{...}}`
 * placeholders referencing either the respondent's Graph profile or an
 * earlier field's answer, e.g. "{{respondent.department}}" or
 * "{{fields.department.value}}" (the ".value" suffix is accepted but
 * ignored — only the field id after "fields." is used).
 */
export function resolveTemplate(
  expression: string,
  ctx: { respondent: Record<string, unknown>; fields: Record<string, unknown> }
): string {
  return expression.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const [root, key] = path.split(".");
    if (root === "respondent") {
      const value = ctx.respondent[key];
      return value === null || value === undefined ? "" : String(value);
    }
    if (root === "fields") {
      const value = ctx.fields[key];
      return value === null || value === undefined ? "" : String(value);
    }
    return "";
  });
}
