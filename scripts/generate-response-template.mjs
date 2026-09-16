/**
 * One-off generator for public/templates/response-template.xlsx — a blank
 * workbook containing a single "Responses" table with just the fixed meta
 * columns (ResponseId, SubmitterEmail, ...). services/excel.ts uploads a copy
 * of this file as each new form's response workbook, then uses the Graph
 * Excel API to append one column per form field afterwards.
 *
 * Runs via Node (exceljs is a devDependency only — it is never bundled into
 * the browser app). Re-run with `node scripts/generate-response-template.mjs`
 * if the meta-column set ever changes; keep it in sync with
 * src/services/excel.ts's META_COLUMNS.
 */
import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const META_COLUMNS = [
  "ResponseId",
  "SubmitterEmail",
  "SubmittedAt",
  "LastEditedBy",
  "LastEditedAt",
  "EditCount",
  "Status",
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Responses");

  sheet.addTable({
    name: "Responses",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: META_COLUMNS.map((name) => ({ name, filterButton: true })),
    rows: [],
  });

  META_COLUMNS.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 22;
  });

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "templates");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "response-template.xlsx");
  await workbook.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
