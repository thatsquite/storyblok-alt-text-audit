import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// update-asset-alt.js
// STEP 2 of write-back. The ONLY script in the repo that writes to Storyblok.
// Reads output/approved-alt-updates.json and sets meta_data.alt on each
// approved IMAGE asset via the Storyblok Management API.
//
// Scope: asset library meta_data.alt only. Story-level alt is NOT updated,
// because SNV stories are rendered pages with no alt field.
//
// SAFETY BY DESIGN:
//   - DRY RUN IS THE DEFAULT. Nothing is sent unless you pass --apply.
//   - Before any live change, current alt is snapshotted to
//     output/rollback-<timestamp>.json, so every edit is reversible.
//   - Read-modify-write: existing meta_data keys are preserved, only alt changes.
//   - Refuses blank approved alt.
//   - Checkpoint: a stopped run resumes, never double-writes.
//   - Rate limiting (Storyblok allows 6 req/s) + retry with backoff.
//   - Per-asset change log to output/update-asset-alt-log.json.
//
// Env (matches export-assets.js and README):
//   STORYBLOK_MANAGEMENT_TOKEN
//   STORYBLOK_SPACE_ID
//   STORYBLOK_REGION   eu | us | ca | ap   (default eu)

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPROVED_FILE = path.join(__dirname, "..", "output", "approved-alt-updates.json");
const CHECKPOINT_FILE = path.join(__dirname, "..", "output", "update-asset-alt-checkpoint.json");
const LOG_FILE = path.join(__dirname, "..", "output", "update-asset-alt-log.json");

const APPLY = process.argv.includes("--apply");
const DELAY_MS = Number(process.env.WB_DELAY_MS || 250); // ~4/sec, under the 6/sec cap
const MAX_RETRIES = 3;

const token = process.env.STORYBLOK_MANAGEMENT_TOKEN?.trim();
const spaceId = process.env.STORYBLOK_SPACE_ID?.trim();
const region = (process.env.STORYBLOK_REGION || "eu").trim().toLowerCase();

// Region-aware host, identical map to src/export-assets.js.
const baseUrls = {
  eu: "https://mapi.storyblok.com",
  us: "https://api-us.storyblok.com",
  ca: "https://api-ca.storyblok.com",
  ap: "https://api-ap.storyblok.com",
};
const baseUrl = baseUrls[region];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJsonOr(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function getAsset(assetId) {
  const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/assets/${assetId}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET asset ${assetId} failed: ${res.status}`);
  return res.json();
}

// Preserve existing meta_data, change only alt (matches README body shape).
async function putAssetAlt(assetId, currentAsset, newAlt) {
  const existingMeta = currentAsset.asset?.meta_data || {};
  const body = { asset: { meta_data: { ...existingMeta, alt: newAlt } } };
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
    const text = await res.text();
    throw new Error(`PUT asset ${assetId} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = attempt * 2000;
      console.warn(`  retry ${attempt}/${MAX_RETRIES} (${label}) after ${backoff}ms: ${err.message}`);
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

  const approved = await readJsonOr(APPROVED_FILE, null);
  if (!approved) {
    console.error(`No approved file at ${APPROVED_FILE}. Run export-approved-alt.js first.`);
    process.exit(1);
  }

  // Guard: refuse any blank alt even if it slipped through.
  const clean = approved.filter((u) => u.alt && String(u.alt).trim().length > 0);
  const blanks = approved.length - clean.length;

  console.log(`Mode: ${APPLY ? "APPLY (live)" : "DRY RUN"}`);
  console.log(`Region: ${region}  Host: ${baseUrl}`);
  console.log(`Approved updates: ${clean.length}${blanks ? `  (skipped ${blanks} blank)` : ""}`);

  // ---- DRY RUN: show current vs approved, change nothing. ----------------
  if (!APPLY) {
    for (const u of clean) {
      if (token && spaceId) {
        try {
          const current = await getAsset(u.asset_id);
          const before = current.asset?.meta_data?.alt ?? "";
          console.log(`  asset ${u.asset_id}: "${before}"  ->  "${u.alt}"  (${u.filename})`);
          await sleep(DELAY_MS);
        } catch (err) {
          console.log(`  asset ${u.asset_id}: [could not read current] -> "${u.alt}"  (${err.message})`);
        }
      } else {
        console.log(`  asset ${u.asset_id}  ->  "${u.alt}"  (${u.filename})`);
      }
    }
    console.log(`\nDry run only. Nothing was sent to Storyblok.`);
    console.log(`To apply for real:  npm run update:asset-alt -- --apply`);
    return;
  }

  // ---- APPLY guardrails ---------------------------------------------------
  if (!token || !spaceId) {
    console.error(`Missing STORYBLOK_MANAGEMENT_TOKEN or STORYBLOK_SPACE_ID in .env`);
    process.exit(1);
  }

  const checkpoint = await readJsonOr(CHECKPOINT_FILE, { done: {} });
  const log = await readJsonOr(LOG_FILE, []);
  const rollback = [];
  const rollbackFile = path.join(
    __dirname, "..", "output", `rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );

  let applied = 0;
  for (const u of clean) {
    const id = String(u.asset_id);
    if (checkpoint.done[id]) continue;

    try {
      const current = await withRetry(() => getAsset(u.asset_id), `get ${id}`);

      rollback.push({
        asset_id: u.asset_id,
        previous_meta_alt: current.asset?.meta_data?.alt ?? "",
      });
      await writeJson(rollbackFile, rollback);

      await withRetry(() => putAssetAlt(u.asset_id, current, u.alt), `put ${id}`);

      log.push({ asset_id: u.asset_id, new_alt: u.alt, applied_at: new Date().toISOString() });
      checkpoint.done[id] = true;
      applied++;

      if (applied % 20 === 0) {
        await writeJson(CHECKPOINT_FILE, checkpoint);
        await writeJson(LOG_FILE, log);
        console.log(`  ...${applied} applied`);
      }
    } catch (err) {
      log.push({ asset_id: u.asset_id, error: String(err.message || err), failed_at: new Date().toISOString() });
      await writeJson(LOG_FILE, log);
      console.error(`  FAILED asset ${id}: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  await writeJson(CHECKPOINT_FILE, checkpoint);
  await writeJson(LOG_FILE, log);

  console.log(`\nApply complete. Updated: ${applied}.`);
  console.log(`Rollback snapshot: ${rollbackFile}`);
  console.log(`Change log: ${LOG_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
