# Storyblok alt text audit

This repository provides a read-only workflow for auditing alt text for image assets in Storyblok.

It retrieves Storyblok assets and stories, finds where images are used, classifies the images, and creates an Excel workbook for review.

The current scripts do not update Storyblok.

## Scope

This project includes image assets only, such as JPEG, PNG, WebP, GIF, SVG, and AVIF.

It does not create alt text for PDFs, documents, videos, audio files, story pages, SEO descriptions, or Open Graph descriptions.

Stories are used only to understand where an image is used and whether story-level alt text exists.

## Alt text rules

### Team member images

Images in the `Team members` asset folder use the colleague's name as the proposed alt text.

The name is created from the filename and must be reviewed.

Example:

```text
jan-jansen.jpg
```

becomes:

```text
Jan Jansen
```

### Donor and partner logos

Donor and partner logos are identified through:

- The asset folder `Logo partner/donor`
- A linked story with content type `donorPartnerType`
- A linked story slug that begins with `donors-and-partners/`

The preferred alt text is the organization name from the linked story.

If no reliable story name exists, the workflow checks the asset title and filename. Generic or unclear filenames do not create a proposal.

### Other images

- Existing alt text is preserved in the current phase.
- Used images with no detected alt text become Storyblok AI candidates.
- Other logos require manual review.
- Images with no detected story usage are not processed yet.

All proposed or generated alt text must be reviewed before an update.

## Workflow

```text
Retrieve Storyblok data
        |
        v
Build the asset inventory
        |
        v
Find image usage in stories
        |
        v
Classify image assets
        |
        v
Create the Excel review workbook
```

## Requirements

- Node.js
- npm
- A Storyblok personal access token
- Read access to the required Storyblok space (personal access token)

Install the dependencies:

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

## Run the audit

Run the commands in this order:

```powershell
npm run probe:folders
npm run build:folder-paths
npm run export:assets
npm run export:stories
npm run export:story-content
npm run build:asset-usage
npm run classify:images
npm run export:audit-excel
```

The final workbook is created here:

```text
output/storyblok-image-alt-audit.xlsx
```

## Main outputs

```text
output/assets-inventory.json
output/stories-content.json
output/asset-usage.json
output/unresolved-asset-references.json
output/image-alt-audit.json
output/storyblok-image-alt-audit.xlsx
```

All files under `output` contain real Storyblok data and must remain outside Git.

## Excel review workbook

The workbook includes separate sheets for:

- All images
- Storyblok AI candidates
- Team members
- Donor and partner logos
- Other logos
- Images with no detected story usage
- Unresolved references
- Review guidance

Reviewers can enter:

- Reviewer decision
- Approved alt text
- Review notes
- Ready for update

## Security

- Keep the repository private and company-managed.
- Store the Storyblok token only in `.env`.
- Never commit tokens or output files.
- Use the minimum required token permissions.
- Revoke and replace an exposed token.

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

- Asset and folder retrieval
- Complete story retrieval
- Asset usage matching
- Image-only classification
- Team member name proposals
- Donor and partner organization-name proposals
- Storyblok AI candidate selection
- Excel review workbook

Not implemented:

- AI alt text generation
- Import of reviewed Excel decisions
- Approved update export
- Storyblok write-back

## Next stage

The next stage can remain in this repository.

It should:

1. Generate suggestions for approved AI candidates.
2. Save suggestions separately from the audit data.
3. Support editorial review.
4. Export approved updates.
5. Use a dry run before any Storyblok update.
