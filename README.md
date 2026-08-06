# Storyblok asset tagging audit

This repository provides a read-only workflow for auditing Storyblok assets.

It covers two areas:

- **Images** - alt text review and workflow classification
- **PDFs** - tag proposals for country, theme, project, and sector

The scripts retrieve data from Storyblok, analyse it locally, and produce Excel workbooks for editorial review. Nothing is written back to Storyblok.

## Scope

### Images

Alt text is proposed for image assets only, such as JPEG, PNG, WebP, GIF, SVG, and AVIF.

### PDFs

Tags are proposed for PDF assets. PDFs do not need alt text, so the goal is findability instead.

### Out of scope

- Alt text for PDFs, documents, video, or audio
- SEO and Open Graph descriptions
- Automatic updates to Storyblok

Stories are used only to find where an asset is used and what context it carries.

## Image alt text rules

### Team member images

Images in the `Team members` asset folder use the colleague's name, derived from the filename.

```text
jan-jansen.jpg
```

becomes:

```text
Jan Jansen
```

### Donor and partner logos

Identified through the `Logo partner/donor` asset folder, a linked story with content type `donorPartnerType`, or a story slug starting with `donors-and-partners/`.

The preferred alt text is the organization name from the linked story, falling back to the asset title and then the filename. Generic filenames produce no proposal.

### Other images

- Existing alt text is preserved.
- Used images with no alt text become AI generation candidates.
- Other logos need manual review.
- Images with no detected story usage are not processed.

## PDF tagging rules

Tags are derived from the linked story title, the filename, and the asset folder, in that order of preference.

Four tag dimensions are proposed:

```text
Tag 1  Country
Tag 2  Theme
Tag 3  Project
Tag 4  Sector
```

Publication type, year, and language are also derived.

### Baseline

Every PDF should carry at least one tag: country, project, theme, or a document type such as a tender or governance document. Anything beyond that is useful but optional.

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

Maintained in `config/projects.json`, currently 180 projects. Each entry has a tag, aliases, and a sector.

Project phases collapse to the base name, so `HortiLIFE III` becomes `HortiLIFE`.

Ambiguous project names that are ordinary English words, such as `LISTEN` or `CRAFT`, use qualifying aliases like `listen kenya` rather than the bare word.

### Sector

Taken from the matched project first, then inferred from the theme. Each record stores which source was used, because project-derived sectors are more reliable.

## Requirements

- Node.js
- npm
- A Storyblok personal access token
- Read access to the Storyblok space

Install dependencies:

```powershell
npm install
```

## Environment variables

Create a local `.env` file:

```env
STORYBLOK_MANAGEMENT_TOKEN=
STORYBLOK_SPACE_ID=
STORYBLOK_REGION=eu
```

Do not commit `.env`.

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

## Outputs

```text
output/assets-inventory.json
output/stories-content.json
output/asset-usage.json
output/unresolved-asset-references.json
output/image-alt-audit.json
output/pdf-tag-audit.json
output/storyblok-image-alt-audit.xlsx
output/storyblok-pdf-tag-audit.xlsx
```

All files under `output` contain real Storyblok data and stay outside Git.

## Review workbooks

### Image workbook

Sheets for all images, AI candidates, team members, donor and partner logos, other logos, images with no usage, unresolved references, and review guidance.

### PDF workbook

Sheets for the summary, untagged PDFs, all PDFs, documents needing review, low confidence tags, documents with no story usage, and review guidance.

The **Untagged** sheet is the priority. It contains only what a reviewer needs to decide, with four empty tag columns.

Reviewers can enter:

```text
Reviewer decision
Approved tags or alt text
Review notes
Ready for update
```

## Security

- Keep the repository private.
- Store the Storyblok token only in `.env`.
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

Not implemented:

- AI alt text generation
- Import of reviewer decisions from Excel
- Approved update export
- Storyblok write-back

## Known limitations

- Some filenames contain URL-encoded characters, handled by a decoder but not exhaustively.
- Character encoding problems exist in some story titles from the source data.
- Documents in French, Spanish, and Portuguese have lower tag coverage than English ones.
- Sector is often inferred from keywords rather than a matched project.
- Some documents have filenames and titles too sparse to classify automatically.
- An asset with no detected story usage may still be linked externally.

## Next stage

The tagging and alt text workflows can remain in this repository.

Planned:

1. Import reviewed decisions from the Excel workbooks.
2. Export an approved update file.
3. Add a dry run before any Storyblok write-back.
