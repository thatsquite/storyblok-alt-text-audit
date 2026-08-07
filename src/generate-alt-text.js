import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAltText, PROVIDER } from "./providers/vision-provider.js";

// generate-alt-text.js
// Generates alt text ONLY for the "Storyblok AI candidate" images and writes
// the result back into the proposed_alt field of output/image-alt-audit.json.
//
// Why write back into image-alt-audit.json:
//   Your existing export:audit-excel already renders proposed_alt into the
//   "AI candidates" sheet, with the reviewer_decision / approved_alt_text /
//   ready_for_update columns. So after running this, you just re-run
//   export:audit-excel and review in the SAME workbook. One review surface,
//   no second drafts file.
//
// Safety:
//   - Reads only workflow_category === "Storyblok AI candidate"
//   - Makes a one-time backup: output/image-alt-audit.backup.json
//   - Checkpoint file so a stopped run resumes, never regenerates a done image
//   - Rate limiting + retry with backoff
//   - Separate failures file
//   - --limit N to test on a handful first (e.g. --limit 10)
//   - Nothing is written to Storyblok here. This is generation only.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUDIT_FILE = path.join(__dirname, "..", "output", "image-alt-audit.json");
const BACKUP_FILE = path.join(__dirname, "..", "output", "image-alt-audit.backup.json");
const PROMPT_FILE = path.join(__dirname, "..", "config", "alt-text-prompt.md");
const CHECKPOINT_FILE = path.join(__dirname, "..", "output", "alt-text-checkpoint.json");
const FAILURES_FILE = path.join(__dirname, "..", "output", "alt-text-failures.json");

const AI_CATEGORY = "Storyblok AI candidate";
const DELAY_MS = Number(process.env.ALT_DELAY_MS || 1200);
const MAX_RETRIES = 3;
const CLI_LIMIT = getCliLimit();

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

async function loadPrompts() {
  const md = await fs.readFile(PROMPT_FILE, "utf8");
  const system = section(md, "## System instruction", "## User instruction template");
  const user = section(md, "## User instruction template", null);
  return { systemPrompt: system.trim(), userPrompt: user.trim() };
}
function section(md, startHeading, endHeading) {
  const start = md.indexOf(startHeading);
  if (start === -1) return "";
  const from = start + startHeading.length;
  const end = endHeading ? md.indexOf(endHeading, from) : md.length;
  return md.slice(from, end === -1 ? md.length : end);
}

function getCliLimit() {
  const i = process.argv.indexOf("--limit");
  return i !== -1 ? Number(process.argv[i + 1]) : null;
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
  console.log(`Provider: ${PROVIDER}`);
  const { systemPrompt, userPrompt } = await loadPrompts();

  const audit = await readJsonOr(AUDIT_FILE, null);
  if (!audit || !Array.isArray(audit.images)) {
    console.error(`Could not read images array from ${AUDIT_FILE}.`);
    process.exit(1);
  }

  // One-time backup before we ever modify the audit file.
  try {
    await fs.access(BACKUP_FILE);
  } catch {
    await writeJson(BACKUP_FILE, audit);
    console.log(`Backup written: ${path.basename(BACKUP_FILE)}`);
  }

  // Select ONLY the AI candidates. This is the corrected filter.
  let candidates = audit.images.filter((img) => img.workflow_category === AI_CATEGORY);
  const totalCandidates = candidates.length;
  if (CLI_LIMIT) candidates = candidates.slice(0, CLI_LIMIT);

  console.log(`AI candidates in file: ${totalCandidates}`);
  console.log(`Processing this run: ${candidates.length}${CLI_LIMIT ? ` (--limit ${CLI_LIMIT})` : ""}`);

  const checkpoint = await readJsonOr(CHECKPOINT_FILE, { done: {} });
  const failures = await readJsonOr(FAILURES_FILE, []);

  // Index images by asset_id so we can write results straight back.
  const byId = new Map(audit.images.map((img) => [img.asset_id, img]));

  let processed = 0;
  for (const candidate of candidates) {
    const id = String(candidate.asset_id);
    if (checkpoint.done[id]) continue;

    try {
      const { altText } = await withRetry(
        () =>
          generateAltText({
            imageUrl: candidate.asset_url,
            filename: candidate.filename,
            folderPath: candidate.folder_path,
            systemPrompt,
            userPrompt,
          }),
        `gen ${id}`
      );

      const target = byId.get(candidate.asset_id);
      const needsReview = altText === "NEEDS_HUMAN_REVIEW" || altText.length > 125;

      target.proposed_alt = altText === "NEEDS_HUMAN_REVIEW" ? "" : altText;
      target.proposal_source = "vision_api";
      target.proposal_confidence = needsReview ? "needs_review" : "generated";

      checkpoint.done[id] = true;
      processed++;

      if (processed % 20 === 0) {
        await writeJson(AUDIT_FILE, audit);
        await writeJson(CHECKPOINT_FILE, checkpoint);
        console.log(`  ...${processed} generated`);
      }
    } catch (err) {
      failures.push({
        asset_id: candidate.asset_id,
        filename: candidate.filename,
        error: String(err.message || err),
        failed_at: new Date().toISOString(),
      });
      await writeJson(FAILURES_FILE, failures);
      console.error(`  FAILED ${id}: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  // Final flush.
  await writeJson(AUDIT_FILE, audit);
  await writeJson(CHECKPOINT_FILE, checkpoint);
  await writeJson(FAILURES_FILE, failures);

  console.log(`\nDone. Generated this run: ${processed}. Failures: ${failures.length}.`);
  console.log(`Proposals written into proposed_alt in ${path.basename(AUDIT_FILE)}.`);
  console.log(`Next: npm run export:audit-excel  then review the AI candidates sheet.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
