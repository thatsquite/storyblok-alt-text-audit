# Synthetic test fixtures

These files contain fictional data for local tests and GitHub.

They preserve the main Storyblok JSON shapes and include these cases:

- Team member image with missing alt text
- Donor or partner logo with an existing visual description
- Used photograph with missing alt text
- Photograph with matching existing alt text
- Generic donor logo filename that must not create a proposal
- Image with no detected story usage
- Root-folder image
- Non-image PDF that must be excluded
- Empty Storyblok asset field
- Unresolved legacy asset reference

All IDs, names, URLs, UUIDs, dates, folder names, story names, and descriptive values are synthetic. The `example.invalid` domain cannot resolve to a real website.

Do not replace your real files under `output`. These fixtures are separate test inputs.
