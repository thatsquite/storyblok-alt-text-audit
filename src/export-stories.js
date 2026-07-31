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

const perPage = 100;
const allStories = [];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchStoryPage(page, attempt = 1) {
  const url =
    `${baseUrl}/v1/spaces/${spaceId}/stories` +
    `?page=${page}&per_page=${perPage}`;

  const response = await fetch(url, {
    headers: {
      Authorization: token,
      Accept: "application/json"
    }
  });

  if (response.status === 429) {
    const maxAttempts = 5;

    if (attempt >= maxAttempts) {
      const details = await response.text();

      throw new Error(
        `Story request failed after ${maxAttempts} attempts ` +
          `on page ${page}: 429 Too Many Requests\n${details}`
      );
    }

    const retryAfterHeader =
      response.headers.get("retry-after");

    const retryAfterSeconds =
      Number(retryAfterHeader);

    const waitMilliseconds =
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : attempt * 2000;

    console.log(
      `Rate limit reached on page ${page}. ` +
        `Retrying attempt ${attempt + 1} after ` +
        `${waitMilliseconds / 1000} seconds.`
    );

    await delay(waitMilliseconds);

    return fetchStoryPage(page, attempt + 1);
  }

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Story request failed on page ${page}: ` +
        `${response.status} ${response.statusText}\n${details}`
    );
  }

  const data = await response.json();

  return {
    stories: data.stories ?? [],
    total: Number(
      response.headers.get("total") ?? 0
    )
  };
}

console.log("Retrieving Storyblok stories...");

let page = 1;
let totalStories = 0;

while (true) {
  const result = await fetchStoryPage(page);

  if (page === 1) {
    totalStories = result.total;

    console.log(
      totalStories > 0
        ? `Storyblok reports ${totalStories} stories.`
        : "Total story count was not available in the response headers."
    );
  }

  allStories.push(...result.stories);

  console.log(
    `Page ${page}: ${result.stories.length} stories retrieved.`
  );

  if (result.stories.length < perPage) {
    break;
  }

  page += 1;

  /*
   * Keep traffic below the Storyblok API rate limit.
   */
  await delay(250);
}

function getContentType(story) {
  if (
    typeof story.content?.component === "string" &&
    story.content.component.trim()
  ) {
    return story.content.component.trim();
  }

  return "";
}

const stories = allStories.map((story) => ({
  story_id: story.id,
  story_uuid: story.uuid ?? "",
  name: story.name ?? "",
  slug: story.slug ?? "",
  full_slug: story.full_slug ?? "",
  content_type: getContentType(story),
  is_folder: Boolean(story.is_folder),
  is_startpage: Boolean(story.is_startpage),
  published: Boolean(story.published),
  unpublished_changes: Boolean(
    story.unpublished_changes
  ),
  created_at: story.created_at ?? null,
  updated_at: story.updated_at ?? null,
  published_at: story.published_at ?? null,
  first_published_at:
    story.first_published_at ?? null,
  last_author_id: story.last_author_id ?? null,
  parent_id: story.parent_id ?? null,
  position: story.position ?? null,
  tag_list: story.tag_list ?? [],
  content: story.content ?? {}
}));

const contentTypeCounts = {};

for (const story of stories) {
  const contentType =
    story.content_type ||
    (story.is_folder ? "[folder]" : "[unknown]");

  contentTypeCounts[contentType] =
    (contentTypeCounts[contentType] ?? 0) + 1;
}

const summary = {
  generated_at: new Date().toISOString(),
  space_id: Number(spaceId),
  stories_retrieved: stories.length,
  storyblok_reported_total: totalStories || null,
  story_total_matches:
    totalStories > 0
      ? stories.length === totalStories
      : null,
  published_stories: stories.filter(
    (story) => story.published
  ).length,
  unpublished_stories: stories.filter(
    (story) => !story.published
  ).length,
  folders: stories.filter(
    (story) => story.is_folder
  ).length,
  content_type_counts: contentTypeCounts
};

await fs.mkdir("output", {
  recursive: true
});

await fs.writeFile(
  "output/stories-export.json",
  JSON.stringify(
    {
      summary,
      stories
    },
    null,
    2
  ),
  "utf8"
);

console.log("");
console.log("Story export completed.");

console.log(
  `Stories retrieved: ${summary.stories_retrieved}`
);

console.log(
  `Storyblok reported total: ` +
    `${summary.storyblok_reported_total ?? "Unavailable"}`
);

console.log(
  `Story total matches: ` +
    `${summary.story_total_matches ?? "Not checked"}`
);

console.log(
  `Published stories: ${summary.published_stories}`
);

console.log(
  `Unpublished stories: ${summary.unpublished_stories}`
);

console.log(`Folders: ${summary.folders}`);

console.log(
  "Saved to output/stories-export.json"
);