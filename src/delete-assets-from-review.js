import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(projectDirectory, "output");
const args = process.argv.slice(2);
const reviewArgumentIndex = args.indexOf("--review-file");
const reviewFileName =
  reviewArgumentIndex < 0
    ? "oldest-assets-deletion-review.json"
    : args[reviewArgumentIndex + 1];
const reviewFile = path.resolve(outputDirectory, reviewFileName ?? "");
const inventoryFile = path.join(outputDirectory, "assets-inventory.json");
const apply = args.includes("--apply");
const includeReferenced = args.includes("--include-referenced");
const staleAfterDays = 7;
const batchSize = 100;
const retryLimit = 5;
const requestDelayMilliseconds = 500;

const token = process.env.STORYBLOK_MANAGEMENT_TOKEN?.trim();
const spaceId = process.env.STORYBLOK_SPACE_ID?.trim();
const region = process.env.STORYBLOK_REGION?.trim().toLowerCase() || "eu";
const baseUrls = {
  eu: "https://mapi.storyblok.com",
  us: "https://api-us.storyblok.com",
  ca: "https://api-ca.storyblok.com",
  ap: "https://api-ap.storyblok.com",
};
const baseUrl = baseUrls[region];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getArgument(name) {
  const index = args.indexOf(name);
  return index < 0 ? "" : args[index + 1] ?? "";
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function compareByAge(first, second) {
  return (
    Date.parse(first.created_at) - Date.parse(second.created_at) ||
    first.asset_id - second.asset_id
  );
}

function validateReview(review, inventory) {
  const confirmationCount = Number(getArgument("--confirm-count"));
  const confirmationTimestamp = getArgument("--confirm-generated-at");

  assert(
    review?.summary && Array.isArray(review.assets),
    `Invalid review list: ${reviewFile}`,
  );
  assert(
    review.summary.deletion_performed === false,
    "The review list indicates deletion has already been performed",
  );
  assert(
    Number.isFinite(Date.parse(review.summary.generated_at)) &&
      Date.now() - Date.parse(review.summary.generated_at) <=
        staleAfterDays * 24 * 60 * 60 * 1000,
    "The review list is stale; refresh it and obtain confirmation for the new list",
  );
  assert(
    confirmationCount === review.assets.length &&
      confirmationCount === review.summary.selected_count,
    `--confirm-count must match the review list (${review.assets.length})`,
  );
  assert(
    confirmationTimestamp === review.summary.generated_at,
    "The confirmation timestamp does not match the reviewed list",
  );
  assert(
    includeReferenced,
    "This reviewed list includes story-referenced assets; pass --include-referenced to confirm that scope",
  );
  assert(
    String(review.summary.space_id) === spaceId &&
      String(inventory.summary.space_id) === spaceId,
    "The review, inventory, and configured Storyblok spaces must match",
  );
  assert(
    inventory.summary.asset_total_matches === true &&
      inventory.summary.assets_retrieved === inventory.assets.length,
    "The refreshed asset inventory does not match Storyblok's reported total",
  );

  const reportIds = review.assets.map((asset) => {
    assert(
      Number.isSafeInteger(asset.asset_id) && asset.asset_id > 0,
      `Invalid asset ID: ${asset.asset_id}`,
    );
    assert(
      Number.isFinite(Date.parse(asset.created_at)),
      `Asset ${asset.asset_id} has no valid creation timestamp`,
    );

    return asset.asset_id;
  });
  const uniqueReportIds = new Set(reportIds);

  assert(
    uniqueReportIds.size === reportIds.length,
    "The review list contains duplicate asset IDs",
  );
  assert(
    review.assets.every((asset, index) =>
      index === 0 || compareByAge(review.assets[index - 1], asset) <= 0,
    ),
    "The review list is not sorted by creation date",
  );

  const currentAssets = inventory.assets
    .filter((asset) => !asset.deleted_at)
    .slice()
    .sort(compareByAge);
  const currentOldestIds = currentAssets
    .slice(0, review.assets.length)
    .map((asset) => asset.asset_id);

  assert(
    currentOldestIds.length === review.assets.length &&
      currentOldestIds.every((assetId, index) => assetId === reportIds[index]),
    "The current oldest-asset set differs from the confirmed review list; regenerate and review it",
  );

  const inventoryById = new Map(
    currentAssets.map((asset) => [normalizeId(asset.asset_id), asset]),
  );

  for (const reviewedAsset of review.assets) {
    const currentAsset = inventoryById.get(
      normalizeId(reviewedAsset.asset_id),
    );
    assert(
      currentAsset &&
        currentAsset.created_at === reviewedAsset.created_at &&
        currentAsset.filename === reviewedAsset.filename,
      `Asset ${reviewedAsset.asset_id} changed since the review list was prepared`,
    );
  }

  return currentAssets.length;
}

async function writeLog(logFile, log) {
  const temporaryFile = `${logFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(log, null, 2), "utf8");
  await fs.rename(temporaryFile, logFile);
}

async function deleteBatch(ids) {
  for (let attempt = 1; attempt <= retryLimit; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/v1/spaces/${spaceId}/assets/bulk_destroy`,
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ ids }),
      },
    );
    const responseText = await response.text();

    if (response.status === 429 && attempt < retryLimit) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMilliseconds =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : attempt * 2000;
      console.warn(
        `Rate limited. Retrying this batch after ${waitMilliseconds / 1000} seconds.`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Bulk deletion failed: ${response.status} ${response.statusText}\n${responseText}`,
      );
    }

    let responseKeys = [];

    if (responseText) {
      try {
        responseKeys = Object.keys(JSON.parse(responseText));
      } catch {
        responseKeys = ["non_json_response"];
      }
    }

    return {
      status: response.status,
      responseKeys,
    };
  }

  throw new Error("Storyblok rate limit retries exhausted");
}

async function main() {
  assert(baseUrl, `Unsupported Storyblok region: ${region}`);
  assert(token && spaceId, "Missing Storyblok Management API credentials");
  assert(
    path.dirname(reviewFile) === outputDirectory,
    "--review-file must name a report directly inside output",
  );

  const [review, inventory] = await Promise.all([
    fs.readFile(reviewFile, "utf8").then(JSON.parse),
    fs.readFile(inventoryFile, "utf8").then(JSON.parse),
  ]);
  const currentAssetCount = validateReview(review, inventory);

  console.log(`Report generated: ${review.summary.generated_at}`);
  console.log(`Space: ${spaceId}`);
  console.log(`Reviewed assets: ${review.assets.length}`);
  console.log(
    `Story-referenced assets included: ${review.summary.assets_with_detected_story_usage}`,
  );
  console.log(
    `Expected remaining assets: ${currentAssetCount - review.assets.length}`,
  );
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);

  if (!apply) {
    console.log("Dry run only. No Storyblok deletion request was made.");
    return;
  }

  const startedAt = new Date().toISOString();
  const logFile = path.join(
    outputDirectory,
    `delete-assets-from-review-${startedAt.replace(/[:.]/g, "-")}.json`,
  );
  const batches = [];

  for (let offset = 0; offset < review.assets.length; offset += batchSize) {
    const assets = review.assets.slice(offset, offset + batchSize);
    batches.push({
      batch_number: batches.length + 1,
      asset_ids: assets.map((asset) => asset.asset_id),
      status: "pending",
      request_status: null,
      response_keys: [],
      error: null,
    });
  }

  const log = {
    started_at: startedAt,
    completed_at: null,
    status: "in_progress",
    space_id: spaceId,
    report_generated_at: review.summary.generated_at,
    selected_count: review.assets.length,
    referenced_assets_included: true,
    batches,
  };
  await writeLog(logFile, log);

  for (const batch of batches) {
    console.log(
      `Deleting batch ${batch.batch_number}/${batches.length} ` +
        `(${batch.asset_ids.length} assets)...`,
    );

    try {
      const result = await deleteBatch(batch.asset_ids);
      batch.status = "completed";
      batch.request_status = result.status;
      batch.response_keys = result.responseKeys;
      await writeLog(logFile, log);
    } catch (error) {
      batch.status = "failed_or_unconfirmed";
      batch.error = error instanceof Error ? error.message : String(error);
      log.status = "partial_or_unconfirmed";
      log.completed_at = new Date().toISOString();
      await writeLog(logFile, log);
      console.error(`Deletion log: ${logFile}`);
      throw error;
    }

    if (batch.batch_number < batches.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, requestDelayMilliseconds),
      );
    }
  }

  log.status = "completed";
  log.completed_at = new Date().toISOString();
  await writeLog(logFile, log);
  console.log(`Storyblok accepted all ${review.assets.length} deletions.`);
  console.log(`Deletion log: ${logFile}`);
}

await main();
