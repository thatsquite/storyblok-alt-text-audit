import ExcelJS from "exceljs";
import fs from "node:fs/promises";

const imageAuditPath = "output/image-alt-audit.json";
const usagePath = "output/asset-usage.json";
const unresolvedPath = "output/unresolved-asset-references.json";
const outputPath = "output/storyblok-image-alt-audit.xlsx";

const COLORS = {
  navy: "17365D",
  blue: "D9EAF7",
  green: "E2F0D9",
  orange: "FCE4D6",
  red: "F4CCCC",
  gray: "E7E6E6",
  purple: "E4DFEC",
  teal: "DDEBF7",
  white: "FFFFFF",
  black: "000000",
};

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value, separator = "; ") {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        return text(item.story_name) || text(item.full_slug);
      }

      return "";
    })
    .filter(Boolean)
    .join(separator);
}

function safeSheetName(name) {
  return name.slice(0, 31);
}

function addTitle(sheet, title, subtitle, columnCount) {
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = {
    bold: true,
    color: { argb: COLORS.white },
    size: 16,
  };
  sheet.getCell(1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  sheet.getCell(1, 1).alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = {
    italic: true,
    color: { argb: "666666" },
  };
  sheet.getCell(2, 1).alignment = {
    wrapText: true,
    vertical: "top",
  };
  sheet.getRow(2).height = 34;
}

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: COLORS.white },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.navy },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
  });
  row.height = 30;
}

function applyRowFormatting(sheet, startRow, endRow, columns) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: "top" };

    for (const column of columns) {
      const cell = row.getCell(column.key);
      cell.alignment = {
        vertical: "top",
        wrapText: true,
      };
    }
  }
}

function addTableSheet(workbook, options) {
  const {
    name,
    title,
    subtitle,
    columns,
    rows,
    tabColor = COLORS.blue,
  } = options;

  const sheet = workbook.addWorksheet(safeSheetName(name), {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
  });

  addTitle(sheet, title, subtitle, columns.length);
  sheet.columns = columns;

  const headerRow = sheet.getRow(3);
  columns.forEach((column, index) => {
    headerRow.getCell(index + 1).value = column.header;
  });
  styleHeader(headerRow);

  rows.forEach((record) => {
    const row = sheet.addRow(columns.map((column) => record[column.key] ?? ""));

    const category = text(record.workflow_category);
    if (category === "Storyblok AI candidate") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.orange },
      };
    } else if (category === "No detected story usage") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.gray },
      };
    }
  });

  const endRow = Math.max(sheet.rowCount, 3);
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: endRow, column: columns.length },
  };

  applyRowFormatting(sheet, 4, endRow, columns);

  columns.forEach((column, index) => {
    const worksheetColumn = sheet.getColumn(index + 1);
    worksheetColumn.width = column.width ?? 18;
  });

  return sheet;
}

function createImageRow(image) {
  return {
    asset_id: image.asset_id,
    filename: text(image.filename),
    asset_url: text(image.asset_url),
    mime_type: text(image.mime_type),
    folder_path: text(image.folder_path),
    usage_count: image.usage_count ?? 0,
    reference_count: image.reference_count ?? 0,
    workflow_category: text(image.workflow_category),
    classification_source: text(image.classification_source),
    current_inventory_alt: text(image.current_inventory_alt),
    story_alt_variants: list(image.story_alt_variants),
    stories_using_asset: list(image.stories_using_asset),
    proposal_source: text(image.proposal_source),
    proposed_alt: text(image.proposed_alt),
    proposal_confidence: text(image.proposal_confidence),
    proposed_action: text(image.proposed_action),
    review_required: image.review_required ? "Yes" : "No",
    review_reason: text(image.review_reason),
    reviewer_decision: "",
    approved_alt_text: "",
    review_notes: "",
    ready_for_update: "",
  };
}

const commonColumns = [
  { header: "Asset ID", key: "asset_id", width: 18 },
  { header: "Filename", key: "filename", width: 34 },
  { header: "Asset URL", key: "asset_url", width: 48 },
  { header: "MIME type", key: "mime_type", width: 18 },
  { header: "Asset folder", key: "folder_path", width: 28 },
  { header: "Usage count", key: "usage_count", width: 13 },
  { header: "Reference count", key: "reference_count", width: 15 },
  { header: "Workflow category", key: "workflow_category", width: 25 },
  { header: "Classification source", key: "classification_source", width: 23 },
  { header: "Current inventory alt", key: "current_inventory_alt", width: 45 },
  { header: "Story alt variants", key: "story_alt_variants", width: 45 },
  { header: "Stories using asset", key: "stories_using_asset", width: 45 },
  { header: "Proposal source", key: "proposal_source", width: 20 },
  { header: "Proposed alt", key: "proposed_alt", width: 45 },
  { header: "Proposal confidence", key: "proposal_confidence", width: 19 },
  { header: "Proposed action", key: "proposed_action", width: 45 },
  { header: "Review required", key: "review_required", width: 16 },
  { header: "Review reason", key: "review_reason", width: 48 },
  { header: "Reviewer decision", key: "reviewer_decision", width: 22 },
  { header: "Approved alt text", key: "approved_alt_text", width: 45 },
  { header: "Review notes", key: "review_notes", width: 40 },
  { header: "Ready for update", key: "ready_for_update", width: 18 },
];

function createSummarySheet(workbook, auditSummary, usageSummary) {
  const sheet = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: COLORS.teal } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [{ width: 42 }, { width: 18 }, { width: 62 }];

  addTitle(
    sheet,
    "Storyblok image alt text audit",
    "Read-only audit of image assets, story usage, workflow classification, and review proposals.",
    3,
  );

  sheet.addRow(["Metric", "Value", "Notes"]);
  styleHeader(sheet.getRow(3));

  const metrics = [
    [
      "Source assets",
      auditSummary.source_assets,
      "All current Storyblok assets in the inventory.",
    ],
    [
      "Image assets",
      auditSummary.image_assets,
      "Only image MIME types are included in this audit.",
    ],
    [
      "Non-image assets excluded",
      auditSummary.non_image_assets_excluded,
      "PDFs, documents, video, audio, and other non-images are outside scope.",
    ],
    [
      "Storyblok AI candidates",
      auditSummary.storyblok_ai_candidate_count,
      "Used images with no detected alt text, excluding special logo and team-member workflows.",
    ],
    [
      "Proposed alt values",
      auditSummary.proposed_alt_count,
      "Filename- or story-derived proposals for team members and donor or partner logos.",
    ],
    [
      "Review required",
      auditSummary.review_required_count,
      "Images requiring editorial or migration review.",
    ],
    [
      "Donor filename proposals rejected",
      auditSummary.donor_partner_filename_proposals_rejected,
      "Generic, numbered, or too-short filenames that were not converted into alt text.",
    ],
    [
      "Matched non-empty references",
      usageSummary.matched_asset_references,
      "Story asset references matched to current asset inventory records.",
    ],
    [
      "Unresolved or ambiguous references",
      usageSummary.unresolved_or_ambiguous_references,
      "Legacy or ambiguous references requiring migration review.",
    ],
    [
      "Assets with no detected story usage",
      usageSummary.assets_with_no_detected_story_usage,
      "Current assets with no matched story reference. This does not prove that they are unused elsewhere.",
    ],
  ];

  metrics.forEach((metric) => sheet.addRow(metric));

  sheet.addRow([]);
  sheet.addRow(["Workflow category", "Count", "Recommended handling"]);
  styleHeader(sheet.getRow(sheet.rowCount));

  const guidance = {
    "Storyblok AI candidate":
      "Generate a suggestion with Storyblok AI, then review before updating.",
    "Team member image": "Use the colleague's reviewed name as alt text.",
    "Existing alt text":
      "Preserve existing alt text unless later quality review flags it.",
    "Donor or partner logo":
      "Use the reviewed organization name, preferably from the linked donor or partner story.",
    "Other logo or brand image":
      "Review manually. Use the organization or brand name rather than visual logo description.",
    "No detected story usage":
      "Do not generate yet. Review whether the asset is needed.",
  };

  const counts = auditSummary.workflow_category_counts ?? {};
  Object.entries(counts).forEach(([category, count]) => {
    sheet.addRow([
      category,
      count,
      guidance[category] ?? "Review according to the workflow category.",
    ]);
  });

  sheet.getColumn(2).numFmt = "#,##0";
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });

  return sheet;
}

function createGuidanceSheet(workbook) {
  const sheet = workbook.addWorksheet("Review guidance", {
    properties: { tabColor: { argb: COLORS.purple } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [{ width: 28 }, { width: 70 }, { width: 70 }];

  addTitle(
    sheet,
    "Review guidance",
    "Use these rules when approving or rejecting proposed alternative text.",
    3,
  );

  sheet.addRow(["Category", "Review rule", "Decision guidance"]);
  styleHeader(sheet.getRow(3));

  const rows = [
    [
      "Team member image",
      "Confirm that the filename-derived name matches the colleague's preferred name.",
      "Use the person's name. Do not replace it with a generic visual description.",
    ],
    [
      "Donor or partner logo",
      "Confirm that the linked story name or filename identifies the organization represented by the logo.",
      "Use the organization name. Replace visual logo descriptions when the organization name is more useful.",
    ],
    [
      "Storyblok AI candidate",
      "Review the generated description for factual accuracy, relevance, brevity, and respectful language.",
      "Approve, edit, or reject the AI suggestion. Do not add project or country context unless it is confirmed and useful.",
    ],
    [
      "Existing alt text",
      "Preserve existing text during this phase.",
      "Only change it later if a separate quality review demonstrates that improvement is needed.",
    ],
    [
      "Other logo or brand image",
      "Identify the organization or brand manually.",
      "Use the organization or brand name, not colors, shapes, or design details.",
    ],
    [
      "No detected story usage",
      "Check whether the asset is used outside Storyblok stories or retained for future use.",
      "Do not generate alt text until its use is confirmed.",
    ],
    [
      "Unresolved reference",
      "Review assets referenced in story content but absent from the current asset inventory.",
      "Handle as a Drupal migration exception. Do not guess a replacement asset.",
    ],
    [
      "Ready for update",
      "Mark Yes only after the approved alt text has been reviewed.",
      "Keep blank or No when the record needs further review.",
    ],
  ];

  rows.forEach((row) => sheet.addRow(row));
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });

  return sheet;
}

async function main() {
  const imageAudit = await readJson(imageAuditPath);
  const usageData = await readJson(usagePath);
  const unresolvedData = await readJson(unresolvedPath);

  const images = Array.isArray(imageAudit.images)
    ? imageAudit.images.map(createImageRow)
    : [];

  const unresolvedRows = Array.isArray(unresolvedData.references)
    ? unresolvedData.references.map((record) => ({
        story_reference_asset_id: record.story_reference_asset_id ?? "",
        filename: text(record.story_reference_filename),
        story_reference_url: text(record.story_reference_url),
        story_name: text(record.story_name),
        full_slug: text(record.full_slug),
        field_path: text(record.field_path),
        match_method: text(record.match_method),
        candidate_asset_ids: list(record.candidate_asset_ids),
        reviewer_decision: "",
        review_notes: "",
      }))
    : [];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SNV Storyblok alt text audit";
  workbook.subject = "Image accessibility and alt text workflow audit";
  workbook.title = "Storyblok image alt text audit";
  workbook.created = new Date();
  workbook.modified = new Date();

  createSummarySheet(
    workbook,
    imageAudit.summary ?? {},
    usageData.summary ?? {},
  );

  addTableSheet(workbook, {
    name: "All images",
    title: "All image assets",
    subtitle:
      "Complete image-only audit. Use filters to review workflow categories, proposals, usage, and existing alt text.",
    columns: commonColumns,
    rows: images,
    tabColor: COLORS.blue,
  });

  const categorySheets = [
    ["AI candidates", "Storyblok AI candidate", COLORS.orange],
    ["Team members", "Team member image", COLORS.green],
    ["Donor partner logos", "Donor or partner logo", COLORS.purple],
    ["Other logos", "Other logo or brand image", COLORS.gray],
    ["No detected usage", "No detected story usage", COLORS.gray],
  ];

  categorySheets.forEach(([sheetName, category, tabColor]) => {
    addTableSheet(workbook, {
      name: sheetName,
      title: category,
      subtitle: `Filtered records for the ${category} workflow. Complete the reviewer decision, approved alt text, review notes, and ready-for-update columns.`,
      columns: commonColumns,
      rows: images.filter((image) => image.workflow_category === category),
      tabColor,
    });
  });

  const unresolvedColumns = [
    {
      header: "Story reference asset ID",
      key: "story_reference_asset_id",
      width: 24,
    },
    { header: "Filename", key: "filename", width: 38 },
    { header: "Story reference URL", key: "story_reference_url", width: 50 },
    { header: "Story name", key: "story_name", width: 38 },
    { header: "Full slug", key: "full_slug", width: 48 },
    { header: "Field path", key: "field_path", width: 42 },
    { header: "Match method", key: "match_method", width: 22 },
    { header: "Candidate asset IDs", key: "candidate_asset_ids", width: 33 },
    { header: "Reviewer decision", key: "reviewer_decision", width: 24 },
    { header: "Review notes", key: "review_notes", width: 48 },
  ];

  addTableSheet(workbook, {
    name: "Unresolved references",
    title: "Unresolved and ambiguous image references",
    subtitle:
      "Story references that could not be matched confidently to a current asset inventory record. Review these as Drupal migration exceptions.",
    columns: unresolvedColumns,
    rows: unresolvedRows,
    tabColor: COLORS.red,
  });

  createGuidanceSheet(workbook);

  await fs.mkdir("output", { recursive: true });
  await workbook.xlsx.writeFile(outputPath);

  console.log("Excel audit export completed.");
  console.log(`Workbook saved to ${outputPath}`);
  console.log(`Image rows exported: ${images.length}`);
  console.log(`Unresolved references exported: ${unresolvedRows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
