import fs from "node:fs/promises";

const inputPath = "output/asset-usage.json";
const outputPath = "output/image-alt-audit.json";

const teamFolderTerms = [
  "team members",
  "team member"
];

const donorPartnerAssetFolder =
  "logo partner/donor";

const genericStoryNames = new Set([
  "donors and partners",
  "donor and partner",
  "partners",
  "homepage",
  "home",
  "footer",
  "site settings",
  "results carousel",
  "project page",
  "demo",
  "test"
]);

const knownTerms = new Map([
  ["eu", "EU"],
  ["giz", "GIZ"],
  ["usaid", "USAID"],
  ["fcdo", "FCDO"],
  ["unicef", "UNICEF"],
  ["undp", "UNDP"],
  ["fao", "FAO"],
  ["ifad", "IFAD"],
  ["ilo", "ILO"],
  ["wfp", "WFP"],
  ["who", "WHO"],
  ["snv", "SNV"],
  ["dgis", "DGIS"],
  ["sida", "Sida"],
  ["norad", "Norad"],
  ["dae", "DAE"],
  ["wateraid", "WaterAid"]
]);

const lowercaseNameTerms = new Set([
  "and",
  "of",
  "for",
  "the",
  "in",
  "on",
  "to",
  "at",
  "by"
]);

const removableFilenameTerms = new Set([
  "logo",
  "logos",
  "white",
  "black",
  "colour",
  "color",
  "coloured",
  "colored",
  "transparent",
  "transparency",
  "rgb",
  "cmyk",
  "web",
  "website",
  "horizontal",
  "vertical",
  "stacked",
  "primary",
  "secondary",
  "final",
  "new",
  "updated",
  "version",
  "original"
]);

const genericFilenameProposals = new Set([
  "download",
  "image",
  "logo",
  "partner",
  "donor",
  "asset",
  "file",
  "picture",
  "photo",
  "unknown"
]);

async function readJson(filePath) {
  const fileContent = await fs.readFile(
    filePath,
    "utf8"
  );

  return JSON.parse(fileContent);
}

async function writeJson(filePath, value) {
  await fs.writeFile(
    filePath,
    JSON.stringify(value, null, 2),
    "utf8"
  );
}

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeForComparison(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isImageAsset(asset) {
  return normalizeText(asset.mime_type)
    .toLowerCase()
    .startsWith("image/");
}

function folderContainsTerm(
  folderPath,
  terms
) {
  const normalizedPath =
    normalizeForComparison(folderPath);

  return terms.some((term) =>
    normalizedPath.includes(
      normalizeForComparison(term)
    )
  );
}

function isTeamMemberAsset(asset) {
  return folderContainsTerm(
    asset.folder_path,
    teamFolderTerms
  );
}

function getLinkedStories(asset) {
  return Array.isArray(
    asset.stories_using_asset
  )
    ? asset.stories_using_asset
    : [];
}

function isDonorPartnerStory(story) {
  const contentType =
    normalizeForComparison(
      story.content_type
    );

  const fullSlug =
    normalizeForComparison(
      story.full_slug
    );

  return (
    contentType === "donorpartnertype" ||
    fullSlug.startsWith(
      "donors and partners/"
    )
  );
}

function hasDonorPartnerAssetFolder(asset) {
  const folderPath =
    normalizeForComparison(
      asset.folder_path
    );

  return (
    folderPath ===
      donorPartnerAssetFolder ||
    folderPath.includes(
      donorPartnerAssetFolder
    )
  );
}

function isDonorPartnerAsset(asset) {
  if (hasDonorPartnerAssetFolder(asset)) {
    return true;
  }

  return getLinkedStories(asset).some(
    isDonorPartnerStory
  );
}

function getDonorPartnerClassificationSource(
  asset
) {
  if (hasDonorPartnerAssetFolder(asset)) {
    return "asset_folder";
  }

  const linkedStories =
    getLinkedStories(asset);

  const contentTypeMatch =
    linkedStories.some((story) =>
      normalizeForComparison(
        story.content_type
      ) === "donorpartnertype"
    );

  if (contentTypeMatch) {
    return "linked_story_type";
  }

  const slugMatch =
    linkedStories.some((story) =>
      normalizeForComparison(
        story.full_slug
      ).startsWith(
        "donors and partners/"
      )
    );

  if (slugMatch) {
    return "linked_story_slug";
  }

  return "";
}

function removeFileExtension(filename) {
  const original =
    normalizeText(filename);

  if (!original) {
    return "";
  }

  const finalPathPart =
    original
      .split("?")[0]
      .split("#")[0]
      .replace(/\\/g, "/")
      .split("/")
      .pop() ?? "";

  const finalDot =
    finalPathPart.lastIndexOf(".");

  if (finalDot <= 0) {
    return finalPathPart;
  }

  return finalPathPart.slice(
    0,
    finalDot
  );
}

function splitFilenameWords(filename) {
  const filenameWithoutExtension =
    removeFileExtension(filename);

  return filenameWithoutExtension
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/[()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function removeDimensionTokens(words) {
  return words.filter((word) => {
    const normalized =
      word.toLowerCase();

    if (/^\d+x\d+$/.test(normalized)) {
      return false;
    }

    if (/^\d{2,5}$/.test(normalized)) {
      return false;
    }

    return true;
  });
}

function removeDuplicateSuffix(words) {
  if (words.length < 2) {
    return words;
  }

  const finalWord =
    words[words.length - 1];

  if (/^\d+$/.test(finalWord)) {
    return words.slice(0, -1);
  }

  return words;
}

function formatWord(word) {
  const normalized =
    word.toLowerCase();

  if (knownTerms.has(normalized)) {
    return knownTerms.get(normalized);
  }

  if (!normalized) {
    return "";
  }

  return (
    normalized.charAt(0).toUpperCase() +
    normalized.slice(1)
  );
}

function formatWords(words) {
  return words
    .map((word, index) => {
      const normalized =
        word.toLowerCase();

      if (
        index > 0 &&
        lowercaseNameTerms.has(
          normalized
        )
      ) {
        return normalized;
      }

      return formatWord(word);
    })
    .filter(Boolean)
    .join(" ");
}

function derivePersonName(filename) {
  const originalWords =
    splitFilenameWords(filename);

  const withoutDimensions =
    removeDimensionTokens(
      originalWords
    );

  const cleanedWords =
    removeDuplicateSuffix(
      withoutDimensions
    );

  const proposedName =
    formatWords(cleanedWords);

  const hasNumbers =
    /\d/.test(proposedName);

  const wordCount =
    proposedName
      .split(" ")
      .filter(Boolean)
      .length;

  const isUsable =
    Boolean(proposedName) &&
    wordCount >= 2 &&
    !hasNumbers;

  return {
    proposedAlt:
      isUsable
        ? proposedName
        : "",
    confidence:
      isUsable
        ? "medium"
        : "low",
    reviewRequired: true,
    reviewReason:
      isUsable
        ? "Confirm that the filename matches the colleague's preferred name."
        : "The filename could not be converted confidently into a person's name."
  };
}

function deriveOrganizationFromFilename(
  filename
) {
  const originalWords =
    splitFilenameWords(filename);

  const withoutDimensions =
    removeDimensionTokens(
      originalWords
    );

  const withoutDuplicateSuffix =
    removeDuplicateSuffix(
      withoutDimensions
    );

  const meaningfulWords =
    withoutDuplicateSuffix.filter(
      (word) =>
        !removableFilenameTerms.has(
          word.toLowerCase()
        )
    );

  const proposedName =
    formatWords(
      meaningfulWords
    );

  const normalizedProposal =
    normalizeForComparison(
      proposedName
    );

  const containsNumber =
    /\d/.test(proposedName);

  const isGeneric =
    genericFilenameProposals.has(
      normalizedProposal
    );

  const isKnownTerm =
    meaningfulWords.length === 1 &&
    knownTerms.has(
      meaningfulWords[0].toLowerCase()
    );

  const isTooShort =
    normalizedProposal.length < 3 &&
    !isKnownTerm;

  const isUsable =
    Boolean(proposedName) &&
    !containsNumber &&
    !isGeneric &&
    !isTooShort;

  return {
    proposedAlt:
      isUsable
        ? proposedName
        : "",
    confidence:
      isUsable
        ? "medium"
        : "low",
    reviewRequired: true,
    reviewReason:
      isUsable
        ? "Confirm the organization name derived from the filename."
        : "The filename is generic, unclear, too short, or contains technical numbering. Identify the organization manually."
  };
}

function getDistinctStoryNames(asset) {
  const linkedStories =
    getLinkedStories(asset);

  const donorPartnerStories =
    linkedStories.filter(
      isDonorPartnerStory
    );

  const preferredStories =
    donorPartnerStories.length > 0
      ? donorPartnerStories
      : linkedStories;

  const uniqueNames =
    new Map();

  for (const story of preferredStories) {
    const originalName =
      normalizeText(
        story.story_name
      );

    const normalizedName =
      normalizeForComparison(
        originalName
      );

    if (!originalName) {
      continue;
    }

    if (
      genericStoryNames.has(
        normalizedName
      )
    ) {
      continue;
    }

    uniqueNames.set(
      normalizedName,
      originalName
    );
  }

  return Array.from(
    uniqueNames.values()
  );
}

function deriveOrganizationName(asset) {
  const storyNames =
    getDistinctStoryNames(asset);

  if (storyNames.length === 1) {
    return {
      proposedAlt:
        storyNames[0],
      proposalSource:
        "linked_story_name",
      confidence:
        "high",
      reviewRequired:
        true,
      reviewReason:
        "Confirm that the linked donor or partner story name is the organization represented by the logo.",
      supportingStoryNames:
        storyNames
    };
  }

  const assetTitle =
    normalizeText(asset.title);

  if (assetTitle) {
    return {
      proposedAlt:
        assetTitle,
      proposalSource:
        "asset_title",
      confidence:
        "medium",
      reviewRequired:
        true,
      reviewReason:
        "Confirm that the asset title is the correct organization name.",
      supportingStoryNames:
        storyNames
    };
  }

  const filenameProposal =
    deriveOrganizationFromFilename(
      asset.filename
    );

  return {
    proposedAlt:
      filenameProposal.proposedAlt,
    proposalSource:
      "filename",
    confidence:
      filenameProposal.confidence,
    reviewRequired:
      filenameProposal.reviewRequired,
    reviewReason:
      storyNames.length > 1
        ? "The logo is linked to several different donor or partner story names. Confirm the organization using the filename and story context."
        : filenameProposal.reviewReason,
    supportingStoryNames:
      storyNames
  };
}

function hasExistingAlt(asset) {
  if (
    normalizeText(
      asset.normalized_alt
    )
  ) {
    return true;
  }

  const storyAltVariants =
    Array.isArray(
      asset.story_alt_variants
    )
      ? asset.story_alt_variants
      : [];

  return storyAltVariants.some(
    (value) =>
      Boolean(normalizeText(value))
  );
}

function getExistingAltSource(asset) {
  if (
    normalizeText(
      asset.normalized_alt
    )
  ) {
    return "asset_inventory";
  }

  const storyAltVariants =
    Array.isArray(
      asset.story_alt_variants
    )
      ? asset.story_alt_variants
      : [];

  if (
    storyAltVariants.some(
      (value) =>
        Boolean(normalizeText(value))
    )
  ) {
    return "story_reference";
  }

  return "";
}

function looksLikeLogo(asset) {
  const filename =
    normalizeForComparison(
      asset.filename
    );

  const folderPath =
    normalizeForComparison(
      asset.folder_path
    );

  return (
    filename.includes("logo") ||
    folderPath.includes("logo")
  );
}

function classifyTeamMember(
  asset,
  existingAlt
) {
  const proposal =
    derivePersonName(
      asset.filename
    );

  return {
    workflow_category:
      "Team member image",
    classification_source:
      "asset_folder",
    proposed_action:
      existingAlt
        ? "Preserve the existing alt text and compare it with the filename-derived colleague name."
        : "Review and use the colleague's name as alt text.",
    proposal_source:
      "filename",
    proposed_alt:
      proposal.proposedAlt,
    proposal_confidence:
      proposal.confidence,
    review_required:
      proposal.reviewRequired,
    review_reason:
      proposal.reviewReason,
    effective_alt_source:
      getExistingAltSource(asset),
    supporting_story_names: []
  };
}

function classifyDonorPartner(
  asset,
  existingAlt
) {
  const proposal =
    deriveOrganizationName(
      asset
    );

  let reviewReason =
    proposal.reviewReason;

  if (
    proposal.proposedAlt &&
    existingAlt
  ) {
    reviewReason =
      "The asset already has alt text. Confirm whether the organization name is more appropriate than the current visual description.";
  }

  return {
    workflow_category:
      "Donor or partner logo",
    classification_source:
      getDonorPartnerClassificationSource(
        asset
      ),
    proposed_action:
      existingAlt
        ? "Compare the existing alt text with the proposed organization name and replace it if the current value describes the logo visually."
        : "Review and use the organization name as alt text.",
    proposal_source:
      proposal.proposalSource,
    proposed_alt:
      proposal.proposedAlt,
    proposal_confidence:
      proposal.confidence,
    review_required:
      proposal.reviewRequired,
    review_reason:
      reviewReason,
    effective_alt_source:
      getExistingAltSource(asset),
    supporting_story_names:
      proposal.supportingStoryNames
  };
}

function classifyOtherLogo(
  asset,
  existingAlt
) {
  return {
    workflow_category:
      "Other logo or brand image",
    classification_source:
      "filename_or_asset_folder",
    proposed_action:
      existingAlt
        ? "Preserve existing alt text and review."
        : "Review the logo manually before adding alt text.",
    proposal_source: "",
    proposed_alt: "",
    proposal_confidence:
      "not_proposed",
    review_required:
      true,
    review_reason:
      "Logo assets need an organization or brand name rather than a visual description.",
    effective_alt_source:
      getExistingAltSource(asset),
    supporting_story_names:
      getDistinctStoryNames(asset)
  };
}

function classifyExistingAlt(asset) {
  return {
    workflow_category:
      "Existing alt text",
    classification_source:
      getExistingAltSource(asset),
    proposed_action:
      "Preserve existing alt text.",
    proposal_source: "",
    proposed_alt: "",
    proposal_confidence:
      "not_required",
    review_required:
      false,
    review_reason: "",
    effective_alt_source:
      getExistingAltSource(asset),
    supporting_story_names: []
  };
}

function classifyAiCandidate() {
  return {
    workflow_category:
      "Storyblok AI candidate",
    classification_source:
      "missing_alt_and_used",
    proposed_action:
      "Generate an alt-text suggestion using Storyblok AI and review it.",
    proposal_source:
      "storyblok_ai",
    proposed_alt: "",
    proposal_confidence:
      "not_generated",
    review_required:
      true,
    review_reason:
      "The image is used in content and has no detected alt text.",
    effective_alt_source: "",
    supporting_story_names: []
  };
}

function classifyUnusedImage() {
  return {
    workflow_category:
      "No detected story usage",
    classification_source:
      "usage_map",
    proposed_action:
      "Do not generate alt text yet. Review whether the image is still needed.",
    proposal_source: "",
    proposed_alt: "",
    proposal_confidence:
      "not_required",
    review_required:
      true,
    review_reason:
      "The current Storyblok stories contain no matched reference to this image.",
    effective_alt_source: "",
    supporting_story_names: []
  };
}

function classifyImage(asset) {
  const existingAlt =
    hasExistingAlt(asset);

  if (isTeamMemberAsset(asset)) {
    return classifyTeamMember(
      asset,
      existingAlt
    );
  }

  if (isDonorPartnerAsset(asset)) {
    return classifyDonorPartner(
      asset,
      existingAlt
    );
  }

  if (looksLikeLogo(asset)) {
    return classifyOtherLogo(
      asset,
      existingAlt
    );
  }

  if (existingAlt) {
    return classifyExistingAlt(
      asset
    );
  }

  if (asset.usage_count > 0) {
    return classifyAiCandidate();
  }

  return classifyUnusedImage();
}

function countByProperty(
  records,
  propertyName
) {
  const counts = {};

  for (const record of records) {
    const value =
      record[propertyName] ||
      "[missing]";

    counts[value] =
      (counts[value] ?? 0) + 1;
  }

  return counts;
}

function createAuditRecord(
  asset,
  classification
) {
  return {
    asset_id:
      asset.asset_id,
    filename:
      asset.filename,
    asset_url:
      asset.asset_url,
    mime_type:
      asset.mime_type,
    folder_id:
      asset.folder_id,
    folder_path:
      asset.folder_path,
    usage_count:
      asset.usage_count,
    reference_count:
      asset.reference_count,
    current_inventory_alt:
      asset.normalized_alt,
    story_alt_variants:
      asset.story_alt_variants,
    stories_using_asset:
      asset.stories_using_asset,
    ...classification
  };
}

async function main() {
  const sourceData =
    await readJson(inputPath);

  const allAssets =
    Array.isArray(sourceData.assets)
      ? sourceData.assets
      : [];

  const imageAssets =
    allAssets.filter(
      isImageAsset
    );

  const classifiedImages =
    imageAssets.map((asset) => {
      const classification =
        classifyImage(asset);

      return createAuditRecord(
        asset,
        classification
      );
    });

  const donorPartnerImages =
    classifiedImages.filter(
      (image) =>
        image.workflow_category ===
        "Donor or partner logo"
    );

  const filenameDonorProposals =
    donorPartnerImages.filter(
      (image) =>
        image.proposal_source ===
        "filename"
    );

  const summary = {
    generated_at:
      new Date().toISOString(),

    source_assets:
      allAssets.length,

    image_assets:
      imageAssets.length,

    non_image_assets_excluded:
      allAssets.length -
      imageAssets.length,

    workflow_category_counts:
      countByProperty(
        classifiedImages,
        "workflow_category"
      ),

    donor_partner_source_counts:
      countByProperty(
        donorPartnerImages,
        "classification_source"
      ),

    donor_partner_proposal_source_counts:
      countByProperty(
        donorPartnerImages,
        "proposal_source"
      ),

    donor_partner_filename_proposals:
      filenameDonorProposals.length,

    donor_partner_filename_proposals_rejected:
      filenameDonorProposals.filter(
        (image) =>
          !normalizeText(
            image.proposed_alt
          )
      ).length,

    proposed_alt_count:
      classifiedImages.filter(
        (image) =>
          Boolean(
            normalizeText(
              image.proposed_alt
            )
          )
      ).length,

    storyblok_ai_candidate_count:
      classifiedImages.filter(
        (image) =>
          image.workflow_category ===
          "Storyblok AI candidate"
      ).length,

    review_required_count:
      classifiedImages.filter(
        (image) =>
          image.review_required
      ).length
  };

  await writeJson(
    outputPath,
    {
      summary,
      images:
        classifiedImages
    }
  );

  console.log(
    "Image classification completed."
  );

  console.log(
    `Image assets classified: ` +
      `${summary.image_assets}`
  );

  console.log(
    `Non-image assets excluded: ` +
      `${summary.non_image_assets_excluded}`
  );

  console.log(
    `Donor or partner logos: ` +
      `${summary.workflow_category_counts["Donor or partner logo"] ?? 0}`
  );

  console.log(
    `Rejected donor filename proposals: ` +
      `${summary.donor_partner_filename_proposals_rejected}`
  );

  console.log(
    `Proposed alt values: ` +
      `${summary.proposed_alt_count}`
  );

  console.log(
    `Storyblok AI candidates: ` +
      `${summary.storyblok_ai_candidate_count}`
  );

  console.log(
    `Review required: ` +
      `${summary.review_required_count}`
  );

  console.log(
    `Saved to ${outputPath}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});