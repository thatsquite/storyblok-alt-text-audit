import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// restore-asset-alt.js
// The UNDO for update-asset-alt.js. Reads a rollback-<timestamp>.json snapshot
// (written by update-asset-alt.js before it changed anything) and restores
// each asset's previous meta_data.alt.
//
// Same safety model as the write-back:
//   - DRY RUN by default. Nothing is sent unless you pass --apply.
//   - You MUST name the snapshot file to restore, so there is no ambiguity.
//   - Read-modify-write: only alt is touched, other meta_data keys preserved.
//   - Rate limiting + retry with backoff.
//   - Safe response parsing: Storyblok may return an empty body on success.
//
// Usage:
//   node src/restore-asset-alt.js --file output/rollback-2026-08-07T11-40-00-000Z.json
//   node src/restore-asset-alt.js --file output/rollback-....json --apply

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes("--apply");
const DELAY_MS = Number(process.env.WB_DELAY_MS || 250);
const MAX_RETRIES = 3;

const token = process.env.STORYBLOK_MANAGEMENT_TOKEN?.trim();
const spaceId = process.env.STORYBLOK_SPACE_ID?.trim();
const region = (process.env.STORYBLOK_REGION || "eu").trim().toLowerCase();

const baseUrls = {
  eu: "https://mapi.storyblok.com",
  us: "https://api-us.storyblok.com",
  ca: "https://api-ca.storyblok.com",
  ap: "https://api-ap.storyblok.com",
};
const baseUrl = baseUrls[region];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getFileArg() {
  const i = process.argv.indexOf("--file");
  return i !== -1 ? process.argv[i + 1] : null;
}

// Parse a fetch response safely. Storyblok may return an empty body on a
// successful PUT, which would make res.json() throw. Read text first, parse
// only if there is content.
async function parseResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function getAsset(assetId) {
  const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/assets/${assetId}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await parseResponse(res);
    throw new Error(
      `GET asset ${assetId} failed: ${res.status} ${JSON.stringify(body)}`,
    );
  }
  return parseResponse(res);
}

async function putAssetAlt(assetId, currentAsset, restoredAlt) {
  const existingMeta = currentAsset.asset?.meta_data || {};
  const body = { asset: { meta_data: { ...existingMeta, alt: restoredAlt } } };
  const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/assets/${assetId}`, {
    method: "PUT",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await parseResponse(res);
    throw new Error(
      `PUT asset ${assetId} failed: ${res.status} ${JSON.stringify(errBody)}`,
    );
  }
  return parseResponse(res);
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = attempt * 2000;
      console.warn(
        `  retry ${attempt}/${MAX_RETRIES} (${label}) after ${backoff}ms: ${err.message}`,
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function main() {
  if (!baseUrl) {
    console.error(`Unsupported Storyblok region: ${region}`);
    process.exit(1);
  }

  const file = getFileArg();
  if (!file) {
    console.error(`Name the snapshot to restore, e.g.:`);
    console.error(
      `  node src/restore-asset-alt.js --file output/rollback-<timestamp>.json`,
    );
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(__dirname, "..", file);
  let snapshot;
  try {
    snapshot = JSON.parse(await fs.readFile(abs, "utf8"));
  } catch {
    console.error(`Could not read snapshot file: ${abs}`);
    process.exit(1);
  }
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    console.error(`Snapshot is empty or not an array: ${abs}`);
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? "APPLY (live)" : "DRY RUN"}`);
  console.log(`Region: ${region}  Host: ${baseUrl}`);
  console.log(`Snapshot: ${path.basename(abs)}`);
  console.log(`Assets to restore: ${snapshot.length}`);

  // ---- DRY RUN ------------------------------------------------------------
  if (!APPLY) {
    for (const s of snapshot) {
      const prev = s.previous_meta_alt ?? "";
      console.log(`  asset ${s.asset_id}: restore alt -> "${prev}"`);
    }
    console.log(`\nDry run only. Nothing was sent to Storyblok.`);
    console.log(
      `To restore for real:  node src/restore-asset-alt.js --file ${file} --apply`,
    );
    return;
  }

  if (!token || !spaceId) {
    console.error(
      `Missing STORYBLOK_MANAGEMENT_TOKEN or STORYBLOK_SPACE_ID in .env`,
    );
    process.exit(1);
  }

  let restored = 0;
  let failed = 0;
  for (const s of snapshot) {
    try {
      const current = await withRetry(
        () => getAsset(s.asset_id),
        `get ${s.asset_id}`,
      );
      await withRetry(
        () => putAssetAlt(s.asset_id, current, s.previous_meta_alt ?? ""),
        `put ${s.asset_id}`,
      );
      restored++;
      if (restored % 20 === 0) console.log(`  ...${restored} restored`);
    } catch (err) {
      failed++;
      console.error(`  FAILED asset ${s.asset_id}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nRestore complete. Restored: ${restored}. Failed: ${failed}.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
