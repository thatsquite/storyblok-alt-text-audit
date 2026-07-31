import "dotenv/config";
import fs from "node:fs/promises";

const token =
  process.env.STORYBLOK_MANAGEMENT_TOKEN?.trim();

const spaceId =
  process.env.STORYBLOK_SPACE_ID?.trim();

const region =
  process.env.STORYBLOK_REGION
    ?.trim()
    .toLowerCase() || "eu";

if (!token || !spaceId) {
  throw new Error(
    "Missing STORYBLOK_MANAGEMENT_TOKEN or " +
      "STORYBLOK_SPACE_ID in .env"
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
  throw new Error(
    `Unsupported Storyblok region: ${region}`
  );
}

const storyIndexPath =
  "output/stories-export.json";

const checkpointPath =
  "output/stories-content-checkpoint.json";

const finalOutputPath =
  "output/stories-content.json";

const failedStoriesPath =
  "output/stories-content-failures.json";

const requestDelayMilliseconds = 250;
const checkpointInterval = 50;
const maxAttempts = 5;

const delay = (milliseconds) =>
  new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, data) {
  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(
    temporaryPath,
    filePath
  );
}

async function loadStoryIndex() {
  if (!(await fileExists(storyIndexPath))) {
    throw new Error(
      `${storyIndexPath} was not found. ` +
        "Run npm run export:stories first."
    );
  }

  const rawData = await fs.readFile(
    storyIndexPath,
    "utf8"
  );

  const data = JSON.parse(rawData);
  const stories = data.stories ?? [];

  if (
    !Array.isArray(stories) ||
    stories.length === 0
  ) {
    throw new Error(
      `No stories were found in ${storyIndexPath}.`
    );
  }

  return {
    summary: data.summary ?? {},
    stories
  };
}

async function loadCheckpoint() {
  if (!(await fileExists(checkpointPath))) {
    return {
      stories: [],
      failed_stories: []
    };
  }

  const rawData = await fs.readFile(
    checkpointPath,
    "utf8"
  );

  const data = JSON.parse(rawData);

  return {
    stories: Array.isArray(data.stories)
      ? data.stories
      : [],
    failed_stories: Array.isArray(
      data.failed_stories
    )
      ? data.failed_stories
      : []
  };
}

async function fetchCompleteStory(
  storyId,
  attempt = 1
) {
  const url =
    `${baseUrl}/v1/spaces/${spaceId}` +
    `/stories/${storyId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: token,
      Accept: "application/json"
    }
  });

  if (response.status === 429) {
    if (attempt >= maxAttempts) {
      const details =
        await response.text();

      throw new Error(
        `Story ${storyId} failed after ` +
          `${maxAttempts} attempts: ` +
          `429 Too Many Requests\n${details}`
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
      `Rate limit reached for story ` +
        `${storyId}. Retrying attempt ` +
        `${attempt + 1} after ` +
        `${waitMilliseconds / 1000} seconds.`
    );

    await delay(waitMilliseconds);

    return fetchCompleteStory(
      storyId,
      attempt + 1
    );
  }

  if (
    response.status >= 500 &&
    response.status <= 599
  ) {
    if (attempt >= maxAttempts) {
      const details =
        await response.text();

      throw new Error(
        `Story ${storyId} failed after ` +
          `${maxAttempts} attempts: ` +
          `${response.status} ` +
          `${response.statusText}\n${details}`
      );
    }

    const waitMilliseconds =
      attempt * 2000;

    console.log(
      `Temporary server error for story ` +
        `${storyId}. Retrying attempt ` +
        `${attempt + 1} after ` +
        `${waitMilliseconds / 1000} seconds.`
    );

    await delay(waitMilliseconds);

    return fetchCompleteStory(
      storyId,
      attempt + 1
    );
  }

  if (!response.ok) {
    const details =
      await response.text();

    throw new Error(
      `Story ${storyId} request failed: ` +
        `${response.status} ` +
        `${response.statusText}\n${details}`
    );
  }

  const data = await response.json();

  if (!data.story) {
    throw new Error(
      `Story ${storyId} response did not ` +
        "contain a story object."
    );
  }

  return data.story;
}

function normalizeCompleteStory(story) {
  return {
    story_id: story.id,
    story_uuid: story.uuid ?? "",
    name: story.name ?? "",
    slug: story.slug ?? "",
    full_slug: story.full_slug ?? "",
    content_type:
      typeof story.content?.component ===
        "string"
        ? story.content.component
        : "",
    is_folder: Boolean(story.is_folder),
    is_startpage: Boolean(
      story.is_startpage
    ),
    published: Boolean(story.published),
    unpublished_changes: Boolean(
      story.unpublished_changes
    ),
    created_at:
      story.created_at ?? null,
    updated_at:
      story.updated_at ?? null,
    published_at:
      story.published_at ?? null,
    first_published_at:
      story.first_published_at ?? null,
    last_author_id:
      story.last_author_id ?? null,
    parent_id:
      story.parent_id ?? null,
    position:
      story.position ?? null,
    tag_list:
      story.tag_list ?? [],
    content:
      story.content ?? {}
  };
}

function createCheckpointData(
  completeStories,
  failedStories,
  totalStories
) {
  return {
    generated_at:
      new Date().toISOString(),
    space_id:
      Number(spaceId),
    total_stories:
      totalStories,
    completed_stories:
      completeStories.length,
    failed_story_count:
      failedStories.length,
    stories:
      completeStories,
    failed_stories:
      failedStories
  };
}

await fs.mkdir("output", {
  recursive: true
});

const storyIndex =
  await loadStoryIndex();

const checkpoint =
  await loadCheckpoint();

const completeStories =
  checkpoint.stories;

const failedStories =
  checkpoint.failed_stories;

const completedIds = new Set(
  completeStories.map(
    (story) => story.story_id
  )
);

const storiesToRetrieve =
  storyIndex.stories.filter(
    (story) =>
      !story.is_folder &&
      !completedIds.has(story.story_id)
  );

const folderCount =
  storyIndex.stories.filter(
    (story) => story.is_folder
  ).length;

console.log(
  "Retrieving complete Storyblok story content..."
);

console.log(
  `Story index records: ` +
    `${storyIndex.stories.length}`
);

console.log(
  `Folder records skipped: ${folderCount}`
);

console.log(
  `Stories already in checkpoint: ` +
    `${completeStories.length}`
);

console.log(
  `Stories remaining: ` +
    `${storiesToRetrieve.length}`
);

let processedSinceCheckpoint = 0;

for (
  let index = 0;
  index < storiesToRetrieve.length;
  index += 1
) {
  const storyRecord =
    storiesToRetrieve[index];

  try {
    const completeStory =
      await fetchCompleteStory(
        storyRecord.story_id
      );

    completeStories.push(
      normalizeCompleteStory(
        completeStory
      )
    );

    completedIds.add(
      storyRecord.story_id
    );

    const previousFailureIndex =
      failedStories.findIndex(
        (failure) =>
          failure.story_id ===
          storyRecord.story_id
      );

    if (previousFailureIndex !== -1) {
      failedStories.splice(
        previousFailureIndex,
        1
      );
    }
  } catch (error) {
    const failure = {
      story_id:
        storyRecord.story_id,
      story_name:
        storyRecord.name ?? "",
      full_slug:
        storyRecord.full_slug ?? "",
      error:
        error instanceof Error
          ? error.message
          : String(error),
      failed_at:
        new Date().toISOString()
    };

    const existingFailureIndex =
      failedStories.findIndex(
        (item) =>
          item.story_id ===
          failure.story_id
      );

    if (existingFailureIndex === -1) {
      failedStories.push(failure);
    } else {
      failedStories[
        existingFailureIndex
      ] = failure;
    }

    console.error(
      `Failed story ` +
        `${storyRecord.story_id}: ` +
        `${failure.error}`
    );
  }

  processedSinceCheckpoint += 1;

  const completedTotal =
    completeStories.length;

  const currentPosition =
    index + 1;

  console.log(
    `Processed ${currentPosition} of ` +
      `${storiesToRetrieve.length} ` +
      `remaining stories. ` +
      `Complete total: ${completedTotal}.`
  );

  if (
    processedSinceCheckpoint >=
    checkpointInterval
  ) {
    const checkpointData =
      createCheckpointData(
        completeStories,
        failedStories,
        storyIndex.stories.length
      );

    await writeJson(
      checkpointPath,
      checkpointData
    );

    console.log(
      `Checkpoint saved after ` +
        `${completeStories.length} ` +
        `complete stories.`
    );

    processedSinceCheckpoint = 0;
  }

  await delay(
    requestDelayMilliseconds
  );
}

completeStories.sort(
  (firstStory, secondStory) =>
    Number(firstStory.story_id) -
    Number(secondStory.story_id)
);

const contentTypeCounts = {};

for (const story of completeStories) {
  const contentType =
    story.content_type ||
    "[unknown]";

  contentTypeCounts[contentType] =
    (contentTypeCounts[contentType] ??
      0) + 1;
}

const expectedContentStories =
  storyIndex.stories.length -
  folderCount;

const finalSummary = {
  generated_at:
    new Date().toISOString(),
  space_id:
    Number(spaceId),
  story_index_records:
    storyIndex.stories.length,
  folder_records_skipped:
    folderCount,
  expected_content_stories:
    expectedContentStories,
  stories_retrieved:
    completeStories.length,
  story_total_matches:
    completeStories.length ===
    expectedContentStories,
  failed_story_count:
    failedStories.length,
  published_stories:
    completeStories.filter(
      (story) => story.published
    ).length,
  unpublished_stories:
    completeStories.filter(
      (story) => !story.published
    ).length,
  stories_with_content:
    completeStories.filter(
      (story) =>
        story.content &&
        Object.keys(
          story.content
        ).length > 0
    ).length,
  content_type_counts:
    contentTypeCounts
};

await writeJson(
  finalOutputPath,
  {
    summary:
      finalSummary,
    stories:
      completeStories
  }
);

await writeJson(
  failedStoriesPath,
  {
    generated_at:
      new Date().toISOString(),
    failures:
      failedStories
  }
);

await writeJson(
  checkpointPath,
  createCheckpointData(
    completeStories,
    failedStories,
    storyIndex.stories.length
  )
);

console.log("");
console.log(
  "Complete story content export finished."
);

console.log(
  `Story index records: ` +
    `${finalSummary.story_index_records}`
);

console.log(
  `Folder records skipped: ` +
    `${finalSummary.folder_records_skipped}`
);

console.log(
  `Expected content stories: ` +
    `${finalSummary.expected_content_stories}`
);

console.log(
  `Stories retrieved: ` +
    `${finalSummary.stories_retrieved}`
);

console.log(
  `Story total matches: ` +
    `${finalSummary.story_total_matches}`
);

console.log(
  `Stories with content: ` +
    `${finalSummary.stories_with_content}`
);

console.log(
  `Failed stories: ` +
    `${finalSummary.failed_story_count}`
);

console.log(
  `Saved to ${finalOutputPath}`
);

console.log(
  `Failures saved to ` +
    `${failedStoriesPath}`
);