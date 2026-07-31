import "dotenv/config";
import fs from "node:fs/promises";

const token = process.env.STORYBLOK_MANAGEMENT_TOKEN?.trim();
const spaceId = process.env.STORYBLOK_SPACE_ID?.trim();
const region =
  process.env.STORYBLOK_REGION?.trim().toLowerCase() || "eu";

if (!token || !spaceId) {
  throw new Error(
    "Missing STORYBLOK_MANAGEMENT_TOKEN or STORYBLOK_SPACE_ID in .env"
  );
}

const baseUrls = {
  eu: "https://mapi.storyblok.com",
  us: "https://api-us.storyblok.com",
  ca: "https://api-ca.storyblok.com",
  ap: "https://api-ap.storyblok.com"
};

const baseUrl = baseUrls[region];

if (!baseUrl) {
  throw new Error(`Unsupported Storyblok region: ${region}`);
}

const url =
  `${baseUrl}/v1/spaces/${spaceId}/asset_folders/?page=1&per_page=100`;

const response = await fetch(url, {
  headers: {
    Authorization: token,
    Accept: "application/json"
  }
});

if (!response.ok) {
  const details = await response.text();

  throw new Error(
    `Storyblok folder request failed: ${response.status} ` +
    `${response.statusText}\n${details}`
  );
}

const data = await response.json();

await fs.mkdir("output", { recursive: true });

await fs.writeFile(
  "output/folders-probe.json",
  JSON.stringify(data, null, 2),
  "utf8"
);

const folders =
  data.asset_folders ??
  data.folders ??
  [];

console.log("Read-only folder probe completed.");
console.log(`Folders returned: ${folders.length}`);
console.log("Saved to output/folders-probe.json");