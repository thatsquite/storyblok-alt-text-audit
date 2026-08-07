import "dotenv/config";
import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// export-approved-alt.js
// STEP 1 of write-back. Reads the reviewed image workbook
// (output/storyblok-image-alt-audit.xlsx), keeps ONLY rows an editor marked
// "Ready for update" = Yes with a non-empty "Approved alt text", and writes
// a clean instruction file: output/approved-alt-updates.json
//
// Workbook layout (from the real file and export-audit-excel.js):
//   Row 1: banner title, Row 2: subtitle, Row 3: HEADERS, Row 4+: data.
// Headers are matched BY NAME, so the banner rows and any future column
// reordering do not break this.
//
// Scope: image asset library alt only. Story-level alt is NOT in scope,
// because SNV stories are rendered pages and carry no alt field.
//
// Sheets: default is the milestone-first order (decided, no-AI sheets).
// Add "AI candidates" once generation + review is complete.
//   npm run export:approved-alt
//   node src/export-approved-alt.js --sheets "Team members,Donor partner logos,AI candidates"

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REVIEW_FILE = path.join(__dirname, "..", "output", "storyblok-image-alt-audit.xlsx");
const APPROVED_FILE = path.join(__dirname, "..", "output", "approved-alt-updates.json");

const DEFAULT_SHEETS = ["Team members", "Donor partner logos"];

// Exact header labels from row 3 of the workbook.
const H = {
  assetId: "Asset ID",
  filename: "Filename",
  approvedAlt: "Approved alt text",
  ready: "Ready for update",
  notes: "Review notes",
};

function getSheetsArg() {
  const i = process.argv.indexOf("--sheets");
  if (i === -1) return DEFAULT_SHEETS;
  return process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean);
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text).trim(); // rich text
  return String(v).trim();
}

// Find the header row by scanning the first 6 rows for one that contains
// both "Asset ID" and "Ready for update". Returns { headerRow, colIndex }.
function locateHeaders(sheet) {
  for (let r = 1; r <= 6; r++) {
    const row = sheet.getRow(r);
    const labels = {};
    row.eachCell((cell, col) => {
      labels[cellText(cell)] = col;
    });
    if (labels[H.assetId] && labels[H.ready]) {
      return { headerRow: r, colIndex: labels };
    }
  }
  return null;
}

async function main() {
  await fs.access(REVIEW_FILE).catch(() => {
    console.error(`Reviewed workbook not found at ${REVIEW_FILE}.`);
    process.exit(1);
  });

  const sheetsToRead = getSheetsArg();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(REVIEW_FILE);

  const approved = [];
  const skipped = { notReady: 0, emptyAlt: 0, tooLong: 0 };
  const perSheet = {};

  for (const sheetName of sheetsToRead) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) {
      console.warn(`Sheet not found, skipping: "${sheetName}"`);
      continue;
    }

    const located = locateHeaders(sheet);
    if (!located) {
      console.warn(`Header row not found in "${sheetName}", skipping.`);
      continue;
    }
    const { headerRow, colIndex } = located;
    perSheet[sheetName] = 0;

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const assetId = cellText(row.getCell(colIndex[H.assetId]));
      if (!assetId) continue; // blank line

      const ready = cellText(row.getCell(colIndex[H.ready])).toLowerCase();
      if (ready !== "yes") {
        skipped.notReady++;
        continue;
      }

      const approvedAlt = cellText(row.getCell(colIndex[H.approvedAlt]));
      if (!approvedAlt) {
        skipped.emptyAlt++;
        continue;
      }
      if (approvedAlt.length > 125) {
        skipped.tooLong++; // approved but too long: block and report
        continue;
      }

      approved.push({
        asset_id: Number(assetId),
        filename: cellText(row.getCell(colIndex[H.filename])),
        alt: approvedAlt,
        source_sheet: sheetName,
        note: colIndex[H.notes] ? cellText(row.getCell(colIndex[H.notes])) : "",
      });
      perSheet[sheetName]++;
    }
  }

  await fs.writeFile(APPROVED_FILE, JSON.stringify(approved, null, 2), "utf8");

  console.log(`Sheets read: ${sheetsToRead.join(", ")}`);
  for (const [s, n] of Object.entries(perSheet)) console.log(`  ${s}: ${n} approved`);
  console.log(`Total approved updates: ${approved.length}`);
  console.log(`Skipped - not ready: ${skipped.notReady}`);
  console.log(`Skipped - empty approved alt: ${skipped.emptyAlt}`);
  console.log(`Skipped - over 125 chars (fix in workbook): ${skipped.tooLong}`);
  console.log(`\nOutput: ${APPROVED_FILE}`);
  console.log(`Next: dry run with  npm run update:asset-alt`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
