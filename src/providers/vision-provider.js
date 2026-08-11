import "dotenv/config";
import path from "node:path";

// vision-provider.js
// API-agnostic wrapper around whatever vision model SNV approves.
//
// The rest of the pipeline only ever calls generateAltText(). It never
// knows or cares which provider is behind it. To switch providers later
// (Azure OpenAI, Google, AWS, etc.), you only edit THIS file. Nothing else.

const PROVIDER = process.env.VISION_PROVIDER || "azure-openai";

/**
 * Generate alt text for a single image.
 * @param {Object} input
 * @param {string} input.imageUrl     Public URL of the image (asset_url).
 * @param {string} input.filename     For prompt context only.
 * @param {string} input.folderPath   For prompt context only.
 * @param {string} input.systemPrompt From config/alt-text-prompt.md.
 * @param {string} input.userPrompt   From config/alt-text-prompt.md.
 * @returns {Promise<{ altText: string, raw: object }>}
 */
export async function generateAltText(input) {
  switch (PROVIDER.toLowerCase()) {
    case "azure-openai":
      return callAzureOpenAI(input);
    case "google":
    case "google-gemini":
    case "gemini":
      return callGoogleGemini(input);
    // case "aws-bedrock":   return callAwsBedrock(input);
    default:
      throw new Error(`Unknown VISION_PROVIDER: ${PROVIDER}`);
  }
}

// ---- Google Gemini implementation -----------------------------------------
// Env vars expected:
//   GOOGLE_API_KEY (or GEMINI_API_KEY / VISION_API_KEY)
//   GOOGLE_MODEL (optional, default: gemini-2.5-flash)
async function callGoogleGemini({
  imageUrl,
  filename,
  folderPath,
  systemPrompt,
  userPrompt,
}) {
  const apiKey =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.VISION_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_API_KEY, GEMINI_API_KEY, or VISION_API_KEY in .env",
    );
  }

  const requestedModel = (
    process.env.GOOGLE_MODEL || "gemini-3.1-flash-lite"
  ).replace(/^models\//, "");

  // Candidate chain strictly using stable, high-quota models (500 requests/day). 
  // Can be updated when moved to paid tier.
  const modelCandidates = Array.from(
    new Set([
      requestedModel, 
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite"
    ]),
  );

  const filledUserPrompt = userPrompt
    .replace("{{filename}}", filename || "")
    .replace("{{folder_path}}", folderPath || "");

  // 1. Fetch image from Storyblok public URL
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
  } catch (err) {
    throw new Error(
      `Network error fetching image from URL (${imageUrl}): ${err.message}`,
    );
  }
  if (!imgRes.ok) {
    throw new Error(
      `Failed to fetch image from URL (${imgRes.status}): ${imageUrl}`,
    );
  }
  const arrayBuffer = await imgRes.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");

  let mimeType = imgRes.headers.get("content-type");
  if (!mimeType || !mimeType.startsWith("image/")) {
    const ext = path.extname(filename || imageUrl).toLowerCase();
    if (ext === ".png") mimeType = "image/png";
    else if (ext === ".webp") mimeType = "image/webp";
    else if (ext === ".gif") mimeType = "image/gif";
    else if (ext === ".svg") mimeType = "image/svg+xml";
    else mimeType = "image/jpeg";
  }

  const body = {
    system_instruction: systemPrompt
      ? { parts: [{ text: systemPrompt }] }
      : undefined,
    contents: [
      {
        role: "user",
        parts: [
          { text: filledUserPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000,
    },
  };

  let lastError;
  for (const model of modelCandidates) {
    console.log(`[Gemini] Trying model: ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const raw = await response.json();
      const parts = raw?.candidates?.[0]?.content?.parts || [];
      const text = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(" ")
        .trim();
      const altText = text
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1")
        .trim();
      return { altText, raw };
    }

    const text = await response.text();
    lastError = new Error(
      `Google Gemini Vision API error ${response.status} (${model}): ${text}`,
    );

    // If model name returned 404 NOT_FOUND, try the next model candidate in fallback chain
    if (response.status === 404 && text.includes("NOT_FOUND")) {
      continue;
    }
    // For any non-404 error (e.g. invalid API key, quota limit), throw immediately
    throw lastError;
  }

  throw lastError;
}

// ---- Azure OpenAI implementation (stub) -----------------------------------
// Env vars expected:
//   VISION_API_KEY           the key from ICT
//   AZURE_OPENAI_ENDPOINT    https://<resource>.openai.azure.com
//   AZURE_OPENAI_DEPLOYMENT  e.g. gpt-4o
async function callAzureOpenAI({
  imageUrl,
  filename,
  folderPath,
  systemPrompt,
  userPrompt,
}) {
  const key = process.env.VISION_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!key || !endpoint || !deployment) {
    throw new Error(
      "Missing VISION_API_KEY, AZURE_OPENAI_ENDPOINT, or AZURE_OPENAI_DEPLOYMENT in .env",
    );
  }

  const filledUserPrompt = userPrompt
    .replace("{{filename}}", filename || "")
    .replace("{{folder_path}}", folderPath || "");

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;

  const body = {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: filledUserPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vision API error ${response.status}: ${text}`);
  }

  const raw = await response.json();
  const altText = raw?.choices?.[0]?.message?.content?.trim() || "";
  return { altText, raw };
}

export { PROVIDER };
