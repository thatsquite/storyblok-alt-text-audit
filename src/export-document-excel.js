import ExcelJS from "exceljs";
import fs from "node:fs/promises";

const inputPath = "output/pdf-tag-audit.json";
const outputPath = "output/storyblok-pdf-tag-audit.xlsx";

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

function addTableSheet(workbook, options) {
  const {
    name,
    title,
    subtitle,
    columns,
    rows,
    tabColor = COLORS.blue,
    highlightUntagged = false,
  } = options;

  const sheet = workbook.addWorksheet(name.slice(0, 31), {
    properties: { tabColor: { argb: tabColor } },
    views: [
      {
        state: "frozen",
        ySplit: 3,
        showGridLines: false,
      },
    ],
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

    if (highlightUntagged && record.has_any_tag === "No") {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.orange },
      };
    }
  });

  const endRow = Math.max(sheet.rowCount, 3);

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: endRow, column: columns.length },
  };

  for (let rowNumber = 4; rowNumber <= endRow; rowNumber += 1) {
    sheet.getRow(rowNumber).alignment = {
      vertical: "top",
      wrapText: true,
    };
  }

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width ?? 18;
  });

  return sheet;
}

function createDocumentRow(record) {
  return {
    asset_id: record.asset_id,
    filename: text(record.filename),
    asset_url: text(record.asset_url),
    folder_path: text(record.folder_path),
    document_category: text(record.document_category),
    usage_count: record.usage_count ?? 0,
    story_names: list(record.story_names),
    story_slugs: list(record.story_slugs),
    current_tags: list(record.current_tags),
    proposed_countries: list(record.proposed_countries),
    proposed_themes: list(record.proposed_themes),
    proposed_projects: list(record.proposed_projects),
    proposed_sectors: list(record.proposed_sectors),
    proposed_publication_types: list(record.proposed_publication_types),
    proposed_years: list(record.proposed_years),
    proposed_languages: list(record.proposed_languages),
    proposed_tags: list(record.proposed_tags, ", "),
    tag_count: record.tag_count ?? 0,
    has_any_tag: record.has_any_tag ? "Yes" : "No",
    country_source: text(record.country_source),
    sector_source: text(record.sector_source),
    confidence: text(record.confidence),
    review_reasons: list(record.review_reasons),
    reviewer_decision: "",
    approved_tags: "",
    review_notes: "",
    ready_for_update: "",
  };
}

const fullColumns = [
  { header: "Asset ID", key: "asset_id", width: 18 },
  { header: "Filename", key: "filename", width: 40 },
  { header: "Asset URL", key: "asset_url", width: 46 },
  { header: "Asset folder", key: "folder_path", width: 26 },
  {
    header: "Document category",
    key: "document_category",
    width: 20,
  },
  { header: "Usage count", key: "usage_count", width: 12 },
  {
    header: "Linked story titles",
    key: "story_names",
    width: 46,
  },
  {
    header: "Current tags",
    key: "current_tags",
    width: 24,
  },
  {
    header: "Tag 1 Country",
    key: "proposed_countries",
    width: 22,
  },
  {
    header: "Tag 2 Theme",
    key: "proposed_themes",
    width: 26,
  },
  {
    header: "Tag 3 Project",
    key: "proposed_projects",
    width: 22,
  },
  {
    header: "Tag 4 Sector",
    key: "proposed_sectors",
    width: 16,
  },
  {
    header: "Publication type",
    key: "proposed_publication_types",
    width: 26,
  },
  { header: "Year", key: "proposed_years", width: 12 },
  {
    header: "Language",
    key: "proposed_languages",
    width: 18,
  },
  {
    header: "All proposed tags",
    key: "proposed_tags",
    width: 52,
  },
  { header: "Tag count", key: "tag_count", width: 11 },
  { header: "Has a tag", key: "has_any_tag", width: 11 },
  {
    header: "Country source",
    key: "country_source",
    width: 16,
  },
  {
    header: "Sector source",
    key: "sector_source",
    width: 16,
  },
  { header: "Confidence", key: "confidence", width: 13 },
  {
    header: "Review reasons",
    key: "review_reasons",
    width: 44,
  },
  {
    header: "Reviewer decision",
    key: "reviewer_decision",
    width: 22,
  },
  {
    header: "Approved tags",
    key: "approved_tags",
    width: 44,
  },
  {
    header: "Review notes",
    key: "review_notes",
    width: 36,
  },
  {
    header: "Ready for update",
    key: "ready_for_update",
    width: 17,
  },
];

const untaggedColumns = [
  { header: "Asset ID", key: "asset_id", width: 18 },
  { header: "Filename", key: "filename", width: 52 },
  { header: "Asset URL", key: "asset_url", width: 50 },
  { header: "Asset folder", key: "folder_path", width: 26 },
  {
    header: "Document category",
    key: "document_category",
    width: 20,
  },
  { header: "Usage count", key: "usage_count", width: 12 },
  {
    header: "Linked story titles",
    key: "story_names",
    width: 56,
  },
  {
    header: "Linked story slugs",
    key: "story_slugs",
    width: 46,
  },
  {
    header: "Review reasons",
    key: "review_reasons",
    width: 40,
  },
  {
    header: "Tag 1 Country",
    key: "reviewer_decision",
    width: 22,
  },
  {
    header: "Tag 2 Theme",
    key: "approved_tags",
    width: 26,
  },
  {
    header: "Tag 3 Project",
    key: "review_notes",
    width: 22,
  },
  {
    header: "Tag 4 Sector",
    key: "ready_for_update",
    width: 18,
  },
];

function createSummarySheet(workbook, summary) {
  const sheet = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: COLORS.teal } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [{ width: 44 }, { width: 16 }, { width: 66 }];

  addTitle(
    sheet,
    "Storyblok PDF tag audit",
    "Read-only audit of PDF assets, derived from asset folders, filenames, and linked story titles. No Storyblok records were changed.",
    3,
  );

  sheet.addRow(["Metric", "Value", "Notes"]);
  styleHeader(sheet.getRow(3));

  const metrics = [
    [
      "Total PDFs",
      summary.pdf_assets,
      "All PDF assets in the Storyblok asset library.",
    ],
    [
      "With at least one tag",
      summary.documents_with_any_tag,
      "Meets the baseline of one usable tag.",
    ],
    [
      "With no tag",
      summary.documents_with_no_tag,
      "Needs manual tagging. See the Untagged sheet.",
    ],
    [
      "Tag coverage",
      `${summary.tag_coverage_percent}%`,
      "Share of PDFs meeting the baseline.",
    ],
    [
      "With a country",
      summary.documents_with_country,
      "Many SNV publications are global and have no country.",
    ],
    [
      "With a theme",
      summary.documents_with_theme,
      "Uses the same theme vocabulary as image tagging.",
    ],
    [
      "With a project",
      summary.documents_with_project,
      "Matched against the project vocabulary in config.",
    ],
    [
      "With a sector",
      summary.documents_with_sector,
      "From the linked project first, then the theme.",
    ],
    [
      "With a publication type",
      summary.documents_with_publication_type,
      "Document format such as factsheet or annual report.",
    ],
    [
      "Requiring review",
      summary.documents_requiring_review,
      "Missing tags, conflicting matches, or no usage.",
    ],
    [
      "No detected story usage",
      summary.documents_with_no_usage,
      "Not referenced by any story. May still be linked elsewhere.",
    ],
    [
      "Projects in vocabulary",
      summary.projects_in_vocabulary,
      "Maintained in config/projects.json.",
    ],
  ];

  metrics.forEach((metric) => sheet.addRow(metric));

  sheet.addRow([]);
  sheet.addRow(["Sector source", "Count", "Meaning"]);
  styleHeader(sheet.getRow(sheet.rowCount));

  const sectorSources = {
    linked_project: "Grounded in a matched project. Higher confidence.",
    theme: "Inferred from theme keywords. Verify before use.",
    "[missing]": "No sector could be determined.",
  };

  const sourceCounts = summary.sector_source_counts ?? {};

  Object.entries(sourceCounts).forEach(([source, count]) => {
    sheet.addRow([
      source,
      count,
      sectorSources[source] ?? "Review the record.",
    ]);
  });

  sheet.getColumn(2).numFmt = "#,##0";

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) {
      row.alignment = {
        vertical: "top",
        wrapText: true,
      };
    }
  });

  return sheet;
}

function createGuidanceSheet(workbook) {
  const sheet = workbook.addWorksheet("Review guidance", {
    properties: { tabColor: { argb: COLORS.purple } },
    views: [{ showGridLines: false }],
  });

  sheet.columns = [{ width: 26 }, { width: 68 }, { width: 68 }];

  addTitle(
    sheet,
    "Review guidance",
    "How to complete the tagging review. Tags go into a single flat pool in Storyblok, so the column split is for review convenience only.",
    3,
  );

  sheet.addRow(["Topic", "Rule", "Guidance"]);
  styleHeader(sheet.getRow(3));

  const rows = [
    [
      "Baseline",
      "Every PDF needs at least one tag: country, project, theme, or document type.",
      "Anything beyond one tag is useful but optional.",
    ],
    [
      "Untagged sheet",
      "These 4 tag columns are empty and ready for manual entry.",
      "Use the filename and linked story title to decide. Leave blank if genuinely unclear.",
    ],
    [
      "Country",
      "Only tag a country when the document is clearly about that country.",
      "Global and multi-country publications should have no country tag.",
    ],
    [
      "Theme",
      "Use the same vocabulary as the image tagging.",
      "Agri-food, WASH, Urban water, Irrigation, Energy, Clean cooking, Climate, Landscapes, GESI, YEE, Finance, Markets, Governance, Digitalisation, Diets, Nexus, Pastoralism.",
    ],
    [
      "Project",
      "Use the base project name without phase numbers.",
      "HortiLIFE III becomes HortiLIFE. RAYEE II becomes RAYEE.",
    ],
    [
      "Sector",
      "Agri-Food, Water, or Energy.",
      "Check the sector source column. Theme-derived sectors are less reliable than project-derived ones.",
    ],
    [
      "Publication type",
      "Describes the document format, not the subject.",
      "Factsheet, annual report, evaluation, terms of reference, governance document.",
    ],
    [
      "Conflicting matches",
      "Several countries, projects, or sectors were detected.",
      "Choose the correct one and record the rest in review notes.",
    ],
    [
      "No detected story usage",
      "The document is not referenced by any story.",
      "Confirm whether it is still needed before tagging.",
    ],
    [
      "Hidden PDFs",
      "Stored in the hidden folder and not listed on the website.",
      "Tag only if the document will remain available.",
    ],
    [
      "Ready for update",
      "Mark Yes only after the tags have been checked.",
      "Leave blank or No when the record still needs work.",
    ],
  ];

  rows.forEach((row) => sheet.addRow(row));

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber >= 4) {
      row.alignment = {
        vertical: "top",
        wrapText: true,
      };
    }
  });

  return sheet;
}

async function main() {
  const audit = await readJson(inputPath);
  const summary = audit.summary ?? {};

  const documents = Array.isArray(audit.documents) ? audit.documents : [];

  if (documents.length === 0) {
    throw new Error(`No documents found in ${inputPath}`);
  }

  const rows = documents.map(createDocumentRow);

  const untagged = rows.filter((row) => row.has_any_tag === "No");

  const needsReview = rows.filter(
    (row) => row.has_any_tag === "Yes" && row.review_reasons,
  );

  const lowConfidence = rows.filter(
    (row) => row.has_any_tag === "Yes" && row.confidence === "low",
  );

  const noUsage = rows.filter((row) => row.usage_count === 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SNV Storyblok tag audit";
  workbook.title = "Storyblok PDF tag audit";
  workbook.created = new Date();
  workbook.modified = new Date();

  createSummarySheet(workbook, summary);

  addTableSheet(workbook, {
    name: "Untagged",
    title: `Untagged PDFs (${untagged.length})`,
    subtitle:
      "These documents have no country, theme, project, sector, or publication type. Complete the four tag columns using the filename and linked story title. Leave blank if genuinely unclear.",
    columns: untaggedColumns,
    rows: untagged,
    tabColor: COLORS.orange,
  });

  addTableSheet(workbook, {
    name: "All PDFs",
    title: "All PDF assets",
    subtitle:
      "Complete audit. Filter by Has a tag, confidence, or review reasons to prioritise.",
    columns: fullColumns,
    rows,
    tabColor: COLORS.blue,
    highlightUntagged: true,
  });

  addTableSheet(workbook, {
    name: "Needs review",
    title: `Tagged but needs review (${needsReview.length})`,
    subtitle:
      "Documents that received tags but have a review flag, such as conflicting matches or no story usage.",
    columns: fullColumns,
    rows: needsReview,
    tabColor: COLORS.red,
  });

  addTableSheet(workbook, {
    name: "Low confidence",
    title: `Low confidence tags (${lowConfidence.length})`,
    subtitle: "Tagged from weak signals. Verify before accepting.",
    columns: fullColumns,
    rows: lowConfidence,
    tabColor: COLORS.gray,
  });

  addTableSheet(workbook, {
    name: "No story usage",
    title: `No detected story usage (${noUsage.length})`,
    subtitle:
      "Not referenced by any story. This does not prove the document is unused, since it may be linked externally.",
    columns: fullColumns,
    rows: noUsage,
    tabColor: COLORS.gray,
  });

  createGuidanceSheet(workbook);

  await workbook.xlsx.writeFile(outputPath);

  console.log("PDF tag workbook created.");
  console.log(`Total PDFs      : ${rows.length}`);
  console.log(`Untagged        : ${untagged.length}`);
  console.log(`Needs review    : ${needsReview.length}`);
  console.log(`Low confidence  : ${lowConfidence.length}`);
  console.log(`No story usage  : ${noUsage.length}`);
  console.log(`Saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
