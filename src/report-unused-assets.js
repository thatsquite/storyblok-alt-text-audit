import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const usageFile = path.join(
  projectDirectory,
  "output",
  "asset-usage.json",
);
const reportFile = path.join(
  projectDirectory,
  "output",
  "unused-assets-report.json",
);
const csvFile = path.join(
  projectDirectory,
  "output",
  "unused-assets-report.csv",
);
const assetLimit = 2500;
const staleAfterDays = 7;

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function normalizeFilename(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.split("/").pop() ?? "")
      .toLowerCase();
  } catch {
    return value
      .split(/[?#]/, 1)[0]
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .trim()
      .toLowerCase();
  }
}

function normalizeAssetUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    let pathname = decodeURIComponent(url.pathname);
    const assetPathPosition = pathname.indexOf("/f/");

    if (assetPathPosition !== -1) {
      pathname = pathname.slice(assetPathPosition);
    }

    return pathname.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
  } catch {
    return "";
  }
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function validateUsageData(data) {
  if (
    !data ||
    !data.summary ||
    !Array.isArray(data.assets) ||
    !Array.isArray(data.usage_records)
  ) {
    throw new Error(
      `${usageFile} is missing the asset usage summary, assets, or usage_records`,
    );
  }

  if (
    !Number.isInteger(data.summary.assets_loaded) ||
    data.summary.assets_loaded !== data.assets.length
  ) {
    throw new Error(
      `Asset count mismatch: summary reports ${data.summary.assets_loaded}, ` +
        `but ${data.assets.length} assets are present`,
    );
  }

  for (const asset of data.assets) {
    if (
      normalizeId(asset.asset_id) === "" ||
      !Number.isInteger(asset.usage_count) ||
      asset.usage_count < 0
    ) {
      throw new Error(
        "Each asset must have an ID and a non-negative integer usage_count",
      );
    }
  }

  if (!Number.isFinite(Date.parse(data.summary.generated_at))) {
    throw new Error("Asset usage summary has no valid generated_at timestamp");
  }
}

function getUnresolvedReferences(records) {
  return records.filter((record) => {
    if (record.is_external_url || record.matched_asset_id !== null) {
      return false;
    }

    return Boolean(
      normalizeId(record.story_reference_asset_id) ||
        normalizeFilename(record.story_reference_filename) ||
        normalizeAssetUrl(record.story_reference_url) ||
        (Array.isArray(record.candidate_asset_ids) &&
          record.candidate_asset_ids.some((id) => normalizeId(id))),
    );
  });
}

function findPotentialReferences(asset, unresolvedReferences) {
  const assetId = normalizeId(asset.asset_id);
  const filename = normalizeFilename(asset.filename);
  const assetUrl = normalizeAssetUrl(asset.asset_url);

  return unresolvedReferences.filter((reference) => {
    const referenceIds = [
      normalizeId(reference.story_reference_asset_id),
      ...(Array.isArray(reference.candidate_asset_ids)
        ? reference.candidate_asset_ids.map(normalizeId)
        : []),
    ].filter(Boolean);

    return (
      referenceIds.includes(assetId) ||
      (filename &&
        normalizeFilename(reference.story_reference_filename) === filename) ||
      (assetUrl &&
        normalizeAssetUrl(reference.story_reference_url) === assetUrl)
    );
  });
}

function createReport(data, generatedAt) {
  const unresolvedReferences = getUnresolvedReferences(data.usage_records);
  const activeAssets = data.assets.filter((asset) => !asset.deleted_at);
  const reviewRequired = [];
  const candidates = [];

  for (const asset of activeAssets) {
    if (asset.usage_count > 0) {
      continue;
    }

    const blockers = [];
    const potentialReferences = findPotentialReferences(
      asset,
      unresolvedReferences,
    );

    if (potentialReferences.length > 0) {
      blockers.push("Could match an unresolved story asset reference");
    }

    if (asset.locked === true) {
      blockers.push("Asset is locked");
    }

    const entry = {
      asset_id: asset.asset_id,
      filename: asset.filename ?? "",
      asset_url: asset.asset_url ?? "",
      folder_path: asset.folder_path ?? "",
      file_size_bytes: asset.file_size_bytes ?? null,
      created_at: asset.created_at ?? null,
      updated_at: asset.updated_at ?? null,
      usage_count: asset.usage_count,
      reference_count: asset.reference_count ?? 0,
      review_reasons: blockers,
      possible_story_references: potentialReferences.map((reference) => ({
        story_id: reference.story_id,
        story_name: reference.story_name ?? "",
        full_slug: reference.full_slug ?? "",
        match_method: reference.match_method ?? "",
      })),
    };

    if (blockers.length > 0) {
      reviewRequired.push(entry);
    } else {
      candidates.push(entry);
    }
  }

  const generatedTimestamp = Date.parse(data.summary.generated_at);
  const ageDays = Math.max(
    0,
    (generatedAt - generatedTimestamp) / (24 * 60 * 60 * 1000),
  );
  const reportedTotal = activeAssets.length;
  const assetsOverLimit = Math.max(reportedTotal - assetLimit, 0);

  return {
    summary: {
      generated_at: new Date(generatedAt).toISOString(),
      source_generated_at: data.summary.generated_at,
      source_age_days: Number(ageDays.toFixed(1)),
      source_is_stale: ageDays > staleAfterDays,
      stale_after_days: staleAfterDays,
      space_id: data.summary.space_id ?? data.assets[0]?.space_id ?? null,
      active_assets_in_snapshot: reportedTotal,
      reported_asset_limit: assetLimit,
      assets_over_limit: assetsOverLimit,
      assets_without_detected_story_usage:
        candidates.length + reviewRequired.length,
      deletion_candidates_for_review: candidates.length,
      assets_needing_reference_or_lock_review: reviewRequired.length,
      assets_over_limit_after_candidates:
        Math.max(reportedTotal - candidates.length - assetLimit, 0),
      unresolved_story_references: unresolvedReferences.length,
      deletion_performed: false,
    },
    candidates,
    review_required: reviewRequired,
  };
}

function createCsv(candidates) {
  const columns = [
    "asset_id",
    "filename",
    "asset_url",
    "folder_path",
    "file_size_bytes",
    "created_at",
    "updated_at",
    "usage_count",
    "reference_count",
  ];

  return [
    columns.map(escapeCsv).join(","),
    ...candidates.map((candidate) =>
      columns.map((column) => escapeCsv(candidate[column])).join(","),
    ),
  ].join("\r\n");
}

async function main() {
  const data = JSON.parse(await fs.readFile(usageFile, "utf8"));
  validateUsageData(data);
  const report = createReport(data, Date.now());

  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(csvFile, createCsv(report.candidates), "utf8");

  console.log(`Asset usage snapshot: ${data.summary.generated_at}`);
  console.log(
    `Assets in snapshot: ${report.summary.active_assets_in_snapshot}`,
  );
  console.log(`Free-tier limit: ${assetLimit}`);
  console.log(
    `Assets over limit: ${report.summary.assets_over_limit}`,
  );
  console.log(
    `Deletion candidates for review: ${report.summary.deletion_candidates_for_review}`,
  );
  console.log(
    `Assets needing reference or lock review: ${report.summary.assets_needing_reference_or_lock_review}`,
  );
  console.log(
    `Over limit after candidates: ${report.summary.assets_over_limit_after_candidates}`,
  );
  console.log(`JSON report: ${reportFile}`);
  console.log(`CSV report: ${csvFile}`);
  console.log("No Storyblok deletion requests were made.");

  if (report.summary.source_is_stale) {
    console.warn(
      `WARNING: source export is ${report.summary.source_age_days} days old. ` +
        "Refresh the Storyblok asset and story exports before using this report.",
    );
  }
}

await main();
