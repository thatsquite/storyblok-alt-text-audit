import fs from "node:fs/promises";

const raw = await fs.readFile("output/pdf-tag-audit.json", "utf8");

const data = JSON.parse(raw);
const docs = data.documents ?? [];

function hasAnyTag(record) {
  return (
    record.proposed_countries.length > 0 ||
    record.proposed_projects.length > 0 ||
    record.proposed_themes.length > 0 ||
    record.proposed_publication_types.length > 0 ||
    record.proposed_sectors.length > 0
  );
}

const tagged = docs.filter(hasAnyTag);
const untagged = docs.filter((record) => !hasAnyTag(record));

const percent = (value) => `${((value / docs.length) * 100).toFixed(1)}%`;

console.log(`Total PDFs   : ${docs.length}`);
console.log(`With a tag   : ${tagged.length}  ` + `${percent(tagged.length)}`);
console.log(
  `With no tag  : ${untagged.length}  ` + `${percent(untagged.length)}`,
);
console.log("");

const counts = {};

for (const record of docs) {
  const filled =
    (record.proposed_countries.length > 0 ? 1 : 0) +
    (record.proposed_projects.length > 0 ? 1 : 0) +
    (record.proposed_themes.length > 0 ? 1 : 0) +
    (record.proposed_publication_types.length > 0 ? 1 : 0) +
    (record.proposed_sectors.length > 0 ? 1 : 0);

  counts[filled] = (counts[filled] ?? 0) + 1;
}

console.log("Tag dimensions filled per document:");

for (const key of Object.keys(counts).sort()) {
  console.log(`  ${key} of 5 : ${counts[key]}  ` + `${percent(counts[key])}`);
}

console.log("");
console.log("Sample of untagged documents:");

for (const record of untagged.slice(0, 25)) {
  const story = record.story_names[0]
    ? ` | ${record.story_names[0].slice(0, 50)}`
    : "";

  console.log(`  ${record.filename.slice(0, 55)}${story}`);
}
