import fs from "node:fs/promises";

const assetsPath = "output/assets-inventory.json";
const storiesPath = "output/stories-content.json";
const usagePath = "output/asset-usage.json";
const unresolvedPath =
  "output/unresolved-asset-references.json";

async function readJson(filePath) {
  const fileContent = await fs.readFile(
    filePath,
    "utf8"
  );

  return JSON.parse(fileContent);
}

async function writeJson(filePath, value) {
  await fs.writeFile(
    filePath,
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeId(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return normalizeText(value);
}

function extractFilename(value) {
  const original = normalizeText(value);

  if (!original) {
    return "";
  }

  try {
    const parsedUrl = new URL(original);

    const pathname = decodeURIComponent(
      parsedUrl.pathname
    );

    return (
      pathname.split("/").pop() ?? ""
    ).toLowerCase();
  } catch {
    return (
      original
        .split("?")[0]
        .split("#")[0]
        .replace(/\\/g, "/")
        .split("/")
        .pop() ?? ""
    ).toLowerCase();
  }
}

function canonicalizeUrl(value) {
  const original = normalizeText(value);

  if (!original) {
    return "";
  }

  let pathname = original;

  try {
    const parsedUrl = new URL(original);

    pathname = decodeURIComponent(
      parsedUrl.pathname
    );
  } catch {
    pathname = original
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/");
  }

  const assetPathPosition =
    pathname.indexOf("/f/");

  if (assetPathPosition !== -1) {
    pathname = pathname.slice(
      assetPathPosition
    );
  }

  return pathname
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isExternalReference(reference) {
  if (reference?.is_external_url === true) {
    return true;
  }

  const urlValue = normalizeText(
    reference?.filename
  );

  if (!urlValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(urlValue);
    const hostname =
      parsedUrl.hostname.toLowerCase();

    if (
      hostname === "a.storyblok.com" ||
      hostname.endsWith(".storyblok.com")
    ) {
      return false;
    }

    if (
      hostname === "s3.amazonaws.com" &&
      parsedUrl.pathname.includes(
        "/a.storyblok.com/"
      )
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isEmptyAssetReference(reference) {
  const id = normalizeId(reference?.id);

  const url = normalizeText(
    reference?.filename
  );

  return !id && !url;
}

function addToIndex(index, key, asset) {
  if (!key) {
    return;
  }

  const existingRecords =
    index.get(key) ?? [];

  existingRecords.push(asset);

  index.set(
    key,
    existingRecords
  );
}

function buildAssetIndexes(assets) {
  const byId = new Map();
  const byUrl = new Map();
  const byFilename = new Map();

  for (const asset of assets) {
    const assetId = normalizeId(
      asset.asset_id
    );

    if (assetId) {
      byId.set(
        assetId,
        asset
      );
    }

    addToIndex(
      byUrl,
      canonicalizeUrl(asset.asset_url),
      asset
    );

    addToIndex(
      byFilename,
      extractFilename(
        asset.filename ||
          asset.asset_url
      ),
      asset
    );
  }

  return {
    byId,
    byUrl,
    byFilename
  };
}

function matchReference(reference, indexes) {
  if (isEmptyAssetReference(reference)) {
    return {
      asset: null,
      method: "empty_asset_field",
      confidence: "not_applicable",
      candidates: []
    };
  }

  if (isExternalReference(reference)) {
    return {
      asset: null,
      method: "external_url",
      confidence: "not_applicable",
      candidates: []
    };
  }

  const referenceId = normalizeId(
    reference?.id
  );

  if (
    referenceId &&
    indexes.byId.has(referenceId)
  ) {
    return {
      asset: indexes.byId.get(
        referenceId
      ),
      method: "asset_id",
      confidence: "high",
      candidates: [referenceId]
    };
  }

  const referenceUrl = canonicalizeUrl(
    reference?.filename
  );

  const urlMatches = referenceUrl
    ? indexes.byUrl.get(referenceUrl) ?? []
    : [];

  if (urlMatches.length === 1) {
    return {
      asset: urlMatches[0],
      method: "asset_url",
      confidence: "high",
      candidates: [
        String(urlMatches[0].asset_id)
      ]
    };
  }

  if (urlMatches.length > 1) {
    return {
      asset: null,
      method: "ambiguous_asset_url",
      confidence: "low",
      candidates: urlMatches.map(
        (asset) =>
          String(asset.asset_id)
      )
    };
  }

  const referenceFilename =
    extractFilename(
      reference?.filename
    );

  const filenameMatches =
    referenceFilename
      ? indexes.byFilename.get(
          referenceFilename
        ) ?? []
      : [];

  if (filenameMatches.length === 1) {
    return {
      asset: filenameMatches[0],
      method: "unique_filename",
      confidence: "medium",
      candidates: [
        String(
          filenameMatches[0].asset_id
        )
      ]
    };
  }

  if (filenameMatches.length > 1) {
    return {
      asset: null,
      method: "ambiguous_filename",
      confidence: "low",
      candidates: filenameMatches.map(
        (asset) =>
          String(asset.asset_id)
      )
    };
  }

  return {
    asset: null,
    method: "unresolved",
    confidence: "none",
    candidates: []
  };
}

function compareAltText(
  inventoryAlt,
  storyAlt
) {
  const inventoryValue =
    normalizeText(inventoryAlt);

  const storyValue =
    normalizeText(storyAlt);

  if (!inventoryValue && !storyValue) {
    return "Both missing";
  }

  if (inventoryValue && !storyValue) {
    return "Inventory alt only";
  }

  if (!inventoryValue && storyValue) {
    return "Story alt only";
  }

  if (
    inventoryValue.toLowerCase() ===
    storyValue.toLowerCase()
  ) {
    return "Matching values";
  }

  return "Different values";
}

function createUsageRecord({
  story,
  reference,
  fieldPath,
  fieldName,
  componentPath,
  match
}) {
  const matchedAsset = match.asset;

  return {
    matched_asset_id:
      matchedAsset?.asset_id ?? null,

    story_reference_asset_id:
      reference?.id ?? null,

    story_reference_url:
      normalizeText(
        reference?.filename
      ),

    story_reference_filename:
      extractFilename(
        reference?.filename
      ),

    story_id:
      story.story_id,

    story_uuid:
      story.story_uuid ?? "",

    story_name:
      story.name ?? "",

    full_slug:
      story.full_slug ?? "",

    content_type:
      story.content_type ?? "",

    published:
      Boolean(story.published),

    unpublished_changes:
      Boolean(
        story.unpublished_changes
      ),

    component:
      componentPath.length > 0
        ? componentPath[
            componentPath.length - 1
          ]
        : "",

    component_path:
      componentPath.join(" > "),

    field_name:
      fieldName,

    field_path:
      fieldPath,

    story_alt:
      normalizeText(reference?.alt),

    story_title:
      normalizeText(reference?.title),

    story_source:
      normalizeText(reference?.source),

    story_copyright:
      normalizeText(
        reference?.copyright
      ),

    story_metadata:
      reference?.meta_data ?? {},

    is_external_url:
      Boolean(
        reference?.is_external_url
      ),

    match_method:
      match.method,

    match_confidence:
      match.confidence,

    candidate_asset_ids:
      match.candidates,

    inventory_filename:
      matchedAsset?.filename ?? "",

    inventory_asset_url:
      matchedAsset?.asset_url ?? "",

    inventory_folder_path:
      matchedAsset?.folder_path ?? "",

    inventory_alt:
      matchedAsset?.normalized_alt ?? "",

    inventory_alt_status:
      matchedAsset?.alt_status ?? "",

    alt_comparison_status:
      compareAltText(
        matchedAsset?.normalized_alt,
        reference?.alt
      )
  };
}

function scanNode({
  node,
  story,
  fieldPath,
  fieldName,
  componentPath,
  indexes,
  records
}) {
  if (
    node === null ||
    node === undefined
  ) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(
      (childNode, childIndex) => {
        scanNode({
          node: childNode,
          story,
          fieldPath:
            `${fieldPath}[${childIndex}]`,
          fieldName:
            `[${childIndex}]`,
          componentPath,
          indexes,
          records
        });
      }
    );

    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const component = normalizeText(
    node.component
  );

  const nextComponentPath = component
    ? [
        ...componentPath,
        component
      ]
    : componentPath;

  if (node.fieldtype === "asset") {
    const match = matchReference(
      node,
      indexes
    );

    records.push(
      createUsageRecord({
        story,
        reference: node,
        fieldPath,
        fieldName,
        componentPath:
          nextComponentPath,
        match
      })
    );
  }

  for (
    const [childKey, childNode] of
    Object.entries(node)
  ) {
    const childPath = fieldPath
      ? `${fieldPath}.${childKey}`
      : childKey;

    scanNode({
      node: childNode,
      story,
      fieldPath: childPath,
      fieldName: childKey,
      componentPath:
        nextComponentPath,
      indexes,
      records
    });
  }
}

function summarizeAssets(
  assets,
  usageRecords
) {
  const recordsByAssetId =
    new Map();

  for (const record of usageRecords) {
    if (
      record.matched_asset_id === null
    ) {
      continue;
    }

    const assetId = String(
      record.matched_asset_id
    );

    const currentRecords =
      recordsByAssetId.get(assetId) ??
      [];

    currentRecords.push(record);

    recordsByAssetId.set(
      assetId,
      currentRecords
    );
  }

  return assets.map((asset) => {
    const assetRecords =
      recordsByAssetId.get(
        String(asset.asset_id)
      ) ?? [];

    const distinctStories =
      new Map();

    const storyAltVariants =
      new Set();

    let publishedReferenceCount = 0;
    let unpublishedReferenceCount = 0;

    for (const record of assetRecords) {
      distinctStories.set(
        String(record.story_id),
        {
          story_id:
            record.story_id,
          story_name:
            record.story_name,
          full_slug:
            record.full_slug,
          content_type:
            record.content_type,
          published:
            record.published
        }
      );

      if (record.story_alt) {
        storyAltVariants.add(
          record.story_alt
        );
      }

      if (record.published) {
        publishedReferenceCount += 1;
      } else {
        unpublishedReferenceCount += 1;
      }
    }

    return {
      ...asset,

      usage_status:
        assetRecords.length > 0
          ? "Used in stories"
          : "No detected story usage",

      usage_count:
        distinctStories.size,

      reference_count:
        assetRecords.length,

      published_reference_count:
        publishedReferenceCount,

      unpublished_reference_count:
        unpublishedReferenceCount,

      stories_using_asset:
        Array.from(
          distinctStories.values()
        ),

      story_alt_variants:
        Array.from(
          storyAltVariants
        ),

      story_alt_variant_count:
        storyAltVariants.size
    };
  });
}

function countByProperty(
  records,
  propertyName
) {
  const counts = {};

  for (const record of records) {
    const value =
      record[propertyName] ??
      "[missing]";

    counts[value] =
      (counts[value] ?? 0) + 1;
  }

  return counts;
}

async function main() {
  const assetsFile =
    await readJson(assetsPath);

  const storiesFile =
    await readJson(storiesPath);

  const assets =
    assetsFile.assets ?? [];

  const stories =
    storiesFile.stories ?? [];

  if (
    !Array.isArray(assets) ||
    assets.length === 0
  ) {
    throw new Error(
      `No assets found in ${assetsPath}`
    );
  }

  if (
    !Array.isArray(stories) ||
    stories.length === 0
  ) {
    throw new Error(
      `No stories found in ${storiesPath}`
    );
  }

  console.log(
    "Building Storyblok asset usage map..."
  );

  console.log(
    `Assets loaded: ${assets.length}`
  );

  console.log(
    `Stories loaded: ${stories.length}`
  );

  const indexes =
    buildAssetIndexes(assets);

  const usageRecords = [];

  stories.forEach(
    (story, storyIndex) => {
      scanNode({
        node: story.content ?? {},
        story,
        fieldPath: "content",
        fieldName: "content",
        componentPath: [],
        indexes,
        records: usageRecords
      });

      if (
        (storyIndex + 1) % 500 === 0
      ) {
        console.log(
          `Stories scanned: ` +
            `${storyIndex + 1} ` +
            `of ${stories.length}`
        );
      }
    }
  );

  const assetSummaries =
    summarizeAssets(
      assets,
      usageRecords
    );

  const emptyAssetFields =
    usageRecords.filter(
      (record) =>
        record.match_method ===
        "empty_asset_field"
    );

  const nonEmptyAssetReferences =
    usageRecords.filter(
      (record) =>
        record.match_method !==
        "empty_asset_field"
    );

  const matchedRecords =
    nonEmptyAssetReferences.filter(
      (record) =>
        record.matched_asset_id !==
        null
    );

  const unresolvedRecords =
    nonEmptyAssetReferences.filter(
      (record) =>
        record.match_method ===
          "unresolved" ||
        record.match_method ===
          "ambiguous_filename" ||
        record.match_method ===
          "ambiguous_asset_url"
    );

  const externalRecords =
    nonEmptyAssetReferences.filter(
      (record) =>
        record.match_method ===
        "external_url"
    );

  const summary = {
    generated_at:
      new Date().toISOString(),

    assets_loaded:
      assets.length,

    stories_scanned:
      stories.length,

    asset_fields_found:
      usageRecords.length,

    empty_asset_fields:
      emptyAssetFields.length,

    non_empty_asset_references:
      nonEmptyAssetReferences.length,

    matched_asset_references:
      matchedRecords.length,

    unresolved_or_ambiguous_references:
      unresolvedRecords.length,

    external_asset_references:
      externalRecords.length,

    assets_used_in_stories:
      assetSummaries.filter(
        (asset) =>
          asset.usage_count > 0
      ).length,

    assets_with_no_detected_story_usage:
      assetSummaries.filter(
        (asset) =>
          asset.usage_count === 0
      ).length,

    match_method_counts:
      countByProperty(
        usageRecords,
        "match_method"
      ),

    alt_comparison_counts:
      countByProperty(
        matchedRecords,
        "alt_comparison_status"
      )
  };

  await writeJson(
    usagePath,
    {
      summary,
      usage_records:
        usageRecords,
      assets:
        assetSummaries
    }
  );

  await writeJson(
    unresolvedPath,
    {
      generated_at:
        new Date().toISOString(),

      unresolved_reference_count:
        unresolvedRecords.length,

      references:
        unresolvedRecords
    }
  );

  console.log("");
  console.log(
    "Asset usage map completed."
  );

  console.log(
    `Asset fields found: ` +
      `${summary.asset_fields_found}`
  );

  console.log(
    `Empty asset fields: ` +
      `${summary.empty_asset_fields}`
  );

  console.log(
    `Non-empty asset references: ` +
      `${summary.non_empty_asset_references}`
  );

  console.log(
    `Matched references: ` +
      `${summary.matched_asset_references}`
  );

  console.log(
    `Unresolved or ambiguous references: ` +
      `${summary.unresolved_or_ambiguous_references}`
  );

  console.log(
    `External asset references: ` +
      `${summary.external_asset_references}`
  );

  console.log(
    `Assets used in stories: ` +
      `${summary.assets_used_in_stories}`
  );

  console.log(
    `Assets with no detected story usage: ` +
      `${summary.assets_with_no_detected_story_usage}`
  );

  console.log(
    `Saved to ${usagePath}`
  );

  console.log(
    `Unresolved references saved to ` +
      `${unresolvedPath}`
  );
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});