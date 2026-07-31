# Pre-upload checklist

Before the first push to the company GitHub repository:

- Confirm the repository is private.
- Confirm the repository belongs to the approved company organization.
- Confirm `.env` is ignored.
- Confirm `output/` is ignored except for `output/.gitkeep`.
- Confirm no real Storyblok URLs, asset IDs, story IDs, names, or exports are in Git.
- Confirm test fixtures use only fictional data and `example.invalid` URLs.
- Run `git status`.
- Run `git diff --cached` before each commit.
- Run `node scripts/check-sensitive-data.js`.
- Review the full Git history if a secret may have been committed.
- Revoke a Storyblok token immediately if it was exposed.

The scan script is a safety check, not a guarantee. Always review staged changes manually.
