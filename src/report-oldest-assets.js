import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(projectDirectory, "output");
const inventoryFile = path.join(outputDirectory, "assets-inventory.json");
const usageFile = path.join(outputDirectory, "asset-usage.json");
const storyIndexFile = path.join(outputDirectory, "stories-export.json");
const storyContentFile = path.join(outputDirectory, "stories-content.json");
const args = process.argv.slice(2);
const countArgumentIndex = args.indexOf("--count");
const selectedCount =
  countArgumentIndex < 0
    ? 7500
    : Number(args[countArgumentIndex + 1]);
const outputSuffix = selectedCount === 7500 ? "" : `-${selectedCount}`;
const reportFile = path.join(
  outputDirectory,
  `oldest-assets-deletion-review${outputSuffix}.json`,
);
const csvFile = path.join(
  outputDirectory,
  `oldest-assets-deletion-review${outputSuffix}.csv`,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeId(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" ? value.trim() : "";
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function summarizeAssets(inventory, usage, storyIndex, storyContent) {
  assert(
    inventory?.summary && Array.isArray(inventory.assets),
    `Invalid asset inventory: ${inventoryFile}`,
  );
  assert(
    inventory.summary.assets_retrieved === inventory.assets.length &&
      inventory.summary.asset_total_matches === true,
    "Inventory count does not match Storyblok's reported total",
  );

  const activeAssets = inventory.assets.filter((asset) => !asset.deleted_at);
  assert(
    activeAssets.length >= selectedCount,
    `Only ${activeAssets.length} active assets are available; ${selectedCount} requested`,
  );

  assert(
    Array.isArray(usage?.usage_records) &&
      Array.isArray(storyIndex?.stories) &&
      Array.isArray(storyContent?.stories),
    "Asset usage, story index, or story content export is incomplete",
  );

  const liveStoryIds = new Set(
    storyIndex.stories
      .filter((story) => !story.is_folder)
      .map((story) => normalizeId(story.story_id)),
  );
  const contentStoryIds = new Set(
    storyContent.stories.map((story) => normalizeId(story.story_id)),
  );
  const missingStoryCount = [...liveStoryIds].filter(
    (storyId) => !contentStoryIds.has(storyId),
  ).length;

  assert(
    missingStoryCount === 0,
    `${missingStoryCount} current stories are missing from the story content export`,
  );

  const usageByAssetId = new Map();

  for (const record of usage.usage_records) {
    const storyId = normalizeId(record.story_id);
    const assetId = normalizeId(record.matched_asset_id);

    if (!liveStoryIds.has(storyId) || !assetId) {
      continue;
    }

    let assetUsage = usageByAssetId.get(assetId);

    if (!assetUsage) {
      assetUsage = {
        storyIds: new Set(),
        referenceCount: 0,
        publishedReferenceCount: 0,
      };
      usageByAssetId.set(assetId, assetUsage);
    }

    assetUsage.storyIds.add(storyId);
    assetUsage.referenceCount += 1;

    if (record.published) {
      assetUsage.publishedReferenceCount += 1;
    }
  }

  const seenIds = new Set();
  const datedAssets = activeAssets.map((asset) => {
    const assetId = normalizeId(asset.asset_id);
    const createdAt = Date.parse(asset.created_at);

    assert(assetId, "An asset is missing its ID");
    assert(!seenIds.has(assetId), `Duplicate asset ID: ${assetId}`);
    assert(
      Number.isFinite(createdAt),
      `Asset ${assetId} has no valid created_at timestamp`,
    );
    seenIds.add(assetId);

    return {
      ...asset,
      created_timestamp: createdAt,
    };
  });

  datedAssets.sort(
    (first, second) =>
      first.created_timestamp - second.created_timestamp ||
      first.asset_id - second.asset_id,
  );

  return {
    activeAssets,
    selected: datedAssets.slice(0, selectedCount).map((asset, index) => {
      const usageAsset = usageByAssetId.get(normalizeId(asset.asset_id));

      return {
        selection_order: index + 1,
        asset_id: asset.asset_id,
        created_at: asset.created_at,
        filename: asset.filename ?? "",
        asset_url: asset.asset_url ?? "",
        folder_path: asset.folder_path ?? "",
        file_size_bytes: asset.file_size_bytes ?? null,
        locked: asset.locked === true,
        usage_count: usageAsset?.storyIds.size ?? 0,
        reference_count: usageAsset?.referenceCount ?? 0,
        published_reference_count: usageAsset?.publishedReferenceCount ?? 0,
      };
    }),
    liveStoryCount: liveStoryIds.size,
    staleStoryContentCount: [...contentStoryIds].filter(
      (storyId) => !liveStoryIds.has(storyId),
    ).length,
  };
}

function createCsv(assets) {
  const columns = [
    "selection_order",
    "asset_id",
    "created_at",
    "filename",
    "folder_path",
    "file_size_bytes",
    "locked",
    "usage_count",
    "reference_count",
    "published_reference_count",
    "asset_url",
  ];

  return [
    columns.map(escapeCsv).join(","),
    ...assets.map((asset) =>
      columns.map((column) => escapeCsv(asset[column])).join(","),
    ),
  ].join("\r\n");
}

async function main() {
  assert(
    Number.isInteger(selectedCount) && selectedCount > 0,
    "Selection count must be a positive integer",
  );
  const inventory = JSON.parse(await fs.readFile(inventoryFile, "utf8"));
  const usage = JSON.parse(await fs.readFile(usageFile, "utf8"));
  const storyIndex = JSON.parse(
    await fs.readFile(storyIndexFile, "utf8"),
  );
  const storyContent = JSON.parse(
    await fs.readFile(storyContentFile, "utf8"),
  );
  const {
    activeAssets,
    selected,
    liveStoryCount,
    staleStoryContentCount,
  } = summarizeAssets(inventory, usage, storyIndex, storyContent);
  const totalReferences = selected.reduce(
    (sum, asset) => sum + (asset.reference_count ?? 0),
    0,
  );
  const assetsWithReferences = selected.filter(
    (asset) => (asset.usage_count ?? 0) > 0,
  ).length;
  const lockedAssets = selected.filter((asset) => asset.locked).length;
  const report = {
    summary: {
      generated_at: new Date().toISOString(),
      space_id: inventory.summary.space_id,
      inventory_generated_at: inventory.summary.generated_at,
      usage_generated_at: usage?.summary?.generated_at ?? null,
      live_story_count: liveStoryCount,
      stale_story_content_count: staleStoryContentCount,
      active_assets_in_inventory: activeAssets.length,
      selected_count: selected.length,
      selection_rule:
        "Oldest active assets by created_at ascending; ties by asset_id ascending",
      first_selected_created_at: selected[0].created_at,
      last_selected_created_at: selected[selected.length - 1].created_at,
      assets_with_detected_story_usage: assetsWithReferences,
      detected_story_reference_count: totalReferences,
      locked_assets: lockedAssets,
      reported_asset_limit: 2500,
      assets_remaining_after_deletion: activeAssets.length - selected.length,
      deletion_performed: false,
    },
    assets: selected,
  };

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(csvFile, createCsv(selected), "utf8");

  console.log(`Active assets in inventory: ${activeAssets.length}`);
  console.log(`Selected oldest assets: ${selected.length}`);
  console.log(
    `Created at range: ${report.summary.first_selected_created_at} through ${report.summary.last_selected_created_at}`,
  );
  console.log(`Current stories scanned: ${liveStoryCount}`);
  console.log(
    `Stale story-content entries excluded: ${staleStoryContentCount}`,
  );
  console.log(
    `Selected assets with detected story usage: ${assetsWithReferences}`,
  );
  console.log(`Detected story references: ${totalReferences}`);
  console.log(`Locked assets: ${lockedAssets}`);
  console.log(
    `Assets remaining after deletion: ${report.summary.assets_remaining_after_deletion}`,
  );
  console.log(`JSON review: ${reportFile}`);
  console.log(`CSV review: ${csvFile}`);
  console.log("No Storyblok deletion requests were made.");
}

await main();
