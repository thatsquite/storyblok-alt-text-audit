# Storyblok asset tagging audit

This repository provides a read-only workflow for auditing Storyblok assets,
plus a reviewed, gated workflow for writing approved alt text back to the
Storyblok asset library.

It covers two areas:

- **Images** - alt text review, workflow classification, optional AI
  generation, and reviewed write-back
- **PDFs** - tag proposals for country, theme, project, and sector

The audit scripts retrieve data from Storyblok, analyse it locally, and produce
Excel workbooks for editorial review. Writing back to Storyblok happens only
through the separate, opt-in write-back scripts, and only after editorial
review.

## Scope

### Images

Alt text is proposed for image assets only, such as JPEG, PNG, WebP, GIF, SVG,
and AVIF.

Alt text is written back to the Storyblok **asset library** only, in
`meta_data.alt`. Story-level alt is out of scope. SNV stories are rendered
pages and do not carry a separate alt field to update, so there is no second
layer to sync.

### PDFs

Tags are proposed for PDF assets. PDFs do not need alt text, so the goal is
findability instead.

### Out of scope

- Alt text for PDFs, documents, video, or audio
- Story-level alt text
- SEO and Open Graph descriptions
- Any automatic update to Storyblok without editorial review

Stories are used only to find where an asset is used and what context it
carries.

## Image alt text rules

### Team member images

Images in the `Team members` asset folder use the colleague's name, derived
from the filename.

```text
jan-jansen.jpg
```

becomes:

```text
Jan Jansen
```

### Donor and partner logos

Identified through the `Logo partner/donor` asset folder, a linked story with
content type `donorPartnerType`, or a story slug starting with
`donors-and-partners/`.

The preferred alt text is the organization name from the linked story, falling
back to the asset title and then the filename. Generic filenames produce no
proposal.

### Other images

- Existing alt text is preserved.
- Used images with no alt text become AI generation candidates.
- Other logos need manual review.
- Images with no detected story usage are not processed.

## PDF tagging rules

Tags are derived from the linked story title, the filename, and the asset
folder, in that order of preference.

Four tag dimensions are proposed:

```text
Tag 1  Country
Tag 2  Theme
Tag 3  Project
Tag 4  Sector
```

Publication type, year, and language are also derived.

### Baseline

Every PDF should carry at least one tag: country, project, theme, or a document
type such as a tender or governance document. Anything beyond that is useful
but optional.

### Theme vocabulary

The same 17 themes used for image tagging:

```text
Agri-food       WASH            Urban water     Irrigation
Energy          Clean cooking   Climate         Landscapes
GESI            YEE             Finance         Markets
Governance      Digitalisation  Diets           Nexus
Pastoralism
```

### Project vocabulary

Maintained in `config/projects.json`, currently 180 projects. Each entry has a
tag, aliases, and a sector.

Project phases collapse to the base name, so `HortiLIFE III` becomes
`HortiLIFE`.

Ambiguous project names that are ordinary English words, such as `LISTEN` or
`CRAFT`, use qualifying aliases like `listen kenya` rather than the bare word.

### Sector

Taken from the matched project first, then inferred from the theme. Each record
stores which source was used, because project-derived sectors are more
reliable.

## Requirements

- Node.js
- npm
- A Storyblok personal access token
- Read access to the Storyblok space
- For AI alt text generation: an approved, enterprise vision API and key
  (see Environment variables)

Install dependencies:

```powershell
npm install
```

## Environment variables

Create a local `.env` file (don't commit `.env`.):

```env
STORYBLOK_MANAGEMENT_TOKEN=
STORYBLOK_SPACE_ID=
STORYBLOK_REGION=eu

# Only needed for AI alt text generation (Google Gemini API or Azure OpenAI)
VISION_PROVIDER=google
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-flash-latest

# Or if using Azure OpenAI:
VISION_PROVIDER=azure-openai
VISION_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=

# Optional pacing (4000ms recommended for Google AI Studio Free Tier 15 RPM limit)
ALT_DELAY_MS=4000
WB_DELAY_MS=250
```


## Running the audit

### Shared extraction

```powershell
npm run probe:folders
npm run build:folder-paths
npm run export:assets
npm run export:stories
npm run export:story-content
npm run build:asset-usage
```

### Asset cleanup candidates

To find assets with no detected story usage, refresh the shared extraction above
and run:

```powershell
npm run report:unused-assets
```

This writes `output/unused-assets-report.json` and
`output/unused-assets-report.csv`. The report excludes assets that may match
unresolved story references or are locked, and lists those separately for
review. It compares the asset count with the free-tier limit of 2,500 and warns
when the source export is more than seven days old.

This command is read-only: it does not call Storyblok or delete assets. Review
each candidate in Storyblok and check for uses outside story asset fields before
deleting anything.

### Age-based cleanup review

To prepare a read-only list of the 7,500 oldest assets, refresh the shared
asset and story exports, then run:

```powershell
npm run report:oldest-assets

# For a smaller age-ranked batch, such as the next 400 oldest remaining assets:
npm run report:oldest-assets -- --count 400
```

This writes `output/oldest-assets-deletion-review.json` and
`output/oldest-assets-deletion-review.csv`, sorted by `created_at` oldest first.
It includes detected story usage and locked status for review, but does not
exclude referenced or locked assets. It does not delete assets or call a
Storyblok write endpoint.

After reviewing and confirming the exact list, use the report's timestamp and
count. Applying requires an explicit flag and an explicit acknowledgement that
story-referenced assets are included:

```powershell
# Dry run
npm run delete:reviewed-assets -- --confirm-count 7500 --confirm-generated-at "REPORT_TIMESTAMP" --include-referenced

# Apply the exact reviewed list
npm run delete:reviewed-assets -- --apply --confirm-count 7500 --confirm-generated-at "REPORT_TIMESTAMP" --include-referenced

# Apply a separately reviewed 400-asset report:
npm run delete:reviewed-assets -- --apply --review-file oldest-assets-deletion-review-400.json --confirm-count 400 --confirm-generated-at "REPORT_TIMESTAMP" --include-referenced
```

The script checks that the current inventory still has the same 7,500 oldest
asset IDs, deletes sequential batches of 100 via Storyblok's bulk asset
endpoint, and writes a local batch log before sending requests.

### Image alt text

```powershell
npm run classify:images
npm run export:audit-excel
```

### PDF tagging

```powershell
npm run classify:documents
npm run check:coverage
npm run export:document-excel
```

## AI alt text generation

Only the `Storyblok AI candidate` images need generation. Team member and
donor or partner logo alt text is already derived without AI, so those do not
depend on this step.

The provider is swappable in `src/providers/vision-provider.js` (`google` or `azure-openai`).

To use Google Gemini API (Free Tier via Google AI Studio):
1. Obtain a free API key at [aistudio.google.com](https://aistudio.google.com).
2. Set `VISION_PROVIDER=google` and `GOOGLE_API_KEY=your_key` in `.env`.
3. Default model: `gemini-flash-latest`. The delay `ALT_DELAY_MS` is set to `4000` (4 seconds) to remain safely within Google AI Studio's free limit of 15 requests per minute (1,500 free requests per day).


```powershell
# Test on a few images first
npm run generate:alt-text -- --limit 10

# Then the full set
npm run generate:alt-text

# Render the new proposals into the review workbook
npm run export:audit-excel
```

Generation writes proposals into the `proposed_alt` field of
`output/image-alt-audit.json`. A one-time backup is written to
`output/image-alt-audit.backup.json` before any change. Review then happens in
the `AI candidates` sheet of `output/storyblok-image-alt-audit.xlsx`, the same
workbook used for all other images.

## Reviewed write-back

Write-back never runs straight from generation. The order is:

```text
1. Reviewer marks rows in the Excel workbook:
   Approved alt text filled, Ready for update = Yes
2. export:approved-alt reads those rows into output/approved-alt-updates.json
3. update:asset-alt runs a DRY RUN by default, showing current vs approved
4. update:asset-alt --apply writes meta_data.alt to the asset library
5. Every change is logged, and a rollback snapshot is written first
```

```powershell
# Extract approved rows. Default reads the decided sheets:
#   Team members and Donor partner logos.
npm run export:approved-alt

# Include AI candidates once they are generated and reviewed:
node src/export-approved-alt.js --sheets "Team members,Donor partner logos,AI candidates"

# Dry run. Changes nothing.
npm run update:asset-alt

# Apply for real.
npm run update:asset-alt -- --apply
```

### Write-back safety

- Dry run is the default. A live write needs the explicit `--apply` flag.
- A rollback snapshot of each asset's current alt is written before any change,
  to `output/rollback-<timestamp>.json`.
- Read-modify-write preserves all other `meta_data` keys and changes only
  `alt`.
- Blank approved alt is refused.
- A checkpoint file lets a stopped run resume without double-writing.
- Rate limiting stays under the Storyblok limit of 6 requests per second.

### Rollback

Every `update:asset-alt --apply` writes a snapshot of each asset's previous
`meta_data.alt` to `output/rollback-<timestamp>.json` before changing anything.
To undo a run, replay that snapshot with `src/restore-asset-alt.js`, which
restores each asset's previous alt.

```powershell
# Dry run. Shows what would be restored, sends nothing.
node src/restore-asset-alt.js --file output/rollback-<timestamp>.json

# Restore for real.
node src/restore-asset-alt.js --file output/rollback-<timestamp>.json --apply
```

Notes:

- You must name the exact snapshot file, so there is no ambiguity about which
  run you are undoing.
- The restore does not delete the snapshot, so it can be run again if needed.
- The restore does not create its own snapshot. To undo a restore, re-run the
  forward write-back.

### Suggested first milestone

Push the team member and donor or partner logo alt text first. That is the set
whose alt text is already decided and needs no AI. It proves the write-back
pipeline end to end on low-risk, high-confidence values before touching the AI
candidates.

Before a large `--apply`, update a few assets first and confirm what the
website actually renders from `meta_data.alt`.

## Outputs

```text
output/assets-inventory.json
output/stories-content.json
output/asset-usage.json
output/unresolved-asset-references.json
output/image-alt-audit.json
output/image-alt-audit.backup.json
output/pdf-tag-audit.json
output/storyblok-image-alt-audit.xlsx
output/storyblok-pdf-tag-audit.xlsx
output/approved-alt-updates.json
output/update-asset-alt-log.json
output/update-asset-alt-checkpoint.json
output/rollback-<timestamp>.json
```

All files under `output` contain real Storyblok data and stay outside Git.

## Review workbooks

### Image workbook

Sheets for all images, AI candidates, team members, donor and partner logos,
other logos, images with no usage, unresolved references, and review guidance.

Reviewers complete these columns per row:

```text
Reviewer decision
Approved alt text
Review notes
Ready for update
```

Only rows where `Ready for update` = Yes with a non-empty `Approved alt text`
are written back. A blank approved alt is never pushed.

### PDF workbook

Sheets for the summary, untagged PDFs, all PDFs, documents needing review, low
confidence tags, documents with no story usage, and review guidance.

The **Untagged** sheet is the priority. It contains only what a reviewer needs
to decide, with four empty tag columns.

## Security

- Keep the repository private.
- Store the Storyblok token and vision API key only in `.env`.
- Never commit tokens or output files.
- Use the minimum required token permissions.
- Revoke and replace an exposed token.

Check before pushing:

```powershell
node scripts\check-sensitive-data.js
```

The `.gitignore` file must include:

```gitignore
node_modules/
.env
output/*
!output/.gitkeep
*.log
```

## Current status

Implemented:

- Storyblok asset, folder, and story extraction
- Asset to story usage mapping
- Image classification with alt text proposals
- PDF tag classification across four dimensions
- Coverage reporting against the one-tag baseline
- Excel review workbooks for images and PDFs
- AI alt text generator for AI-candidate images (provider swappable,
  gated on an approved enterprise vision API)
- Optional pre-fill of approvals for the decided sheets
- Import of reviewer decisions from the Excel workbook
- Approved update export
- Reviewed Storyblok write-back with dry run, rollback, and logging
- Rollback restore from a snapshot file

Not implemented:

- A configured production vision provider (waiting on SNV-approved API and key)

## Known limitations

- Some filenames contain URL-encoded characters, handled by a decoder but not
  exhaustively.
- Character encoding problems exist in some story titles from the source data.
- Documents in French, Spanish, and Portuguese have lower tag coverage than
  English ones.
- Sector is often inferred from keywords rather than a matched project.
- Some documents have filenames and titles too sparse to classify
  automatically.
- An asset with no detected story usage may still be linked externally.
- Alt text write-back updates the asset library only. If a story was authored
  with its own inline alt at the time, confirm on one asset how the frontend
  renders before a full run.

## Next stage

The audit, generation, and write-back workflows can remain in this repository.

Immediate next steps:

1. Confirm the SNV-approved vision API and add its key to `.env`.
2. Wire that provider in `src/providers/vision-provider.js`.
3. Run the team member and donor or partner logo write-back as the first
   milestone.
