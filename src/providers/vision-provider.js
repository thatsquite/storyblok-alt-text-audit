import "dotenv/config";

// vision-provider.js
// API-agnostic wrapper around whatever vision model SNV approves.
//
// The rest of the pipeline only ever calls generateAltText(). It never
// knows or cares which provider is behind it. To switch providers later
// (Azure OpenAI, Google, AWS, etc.), you only edit THIS file. Nothing else.
//
// The Azure OpenAI path is stubbed as the most likely approved option.
// Fill it in once ICT (Chitra) confirms the endpoint, deployment, and key.

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
  switch (PROVIDER) {
    case "azure-openai":
      return callAzureOpenAI(input);
    // case "google-vertex": return callGoogleVertex(input);
    // case "aws-bedrock":   return callAwsBedrock(input);
    default:
      throw new Error(`Unknown VISION_PROVIDER: ${PROVIDER}`);
  }
}

// ---- Azure OpenAI implementation (stub) -----------------------------------
// Env vars expected:
//   VISION_API_KEY           the key from ICT
//   AZURE_OPENAI_ENDPOINT    https://<resource>.openai.azure.com
//   AZURE_OPENAI_DEPLOYMENT  e.g. gpt-4o
async function callAzureOpenAI({ imageUrl, filename, folderPath, systemPrompt, userPrompt }) {
  const key = process.env.VISION_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!key || !endpoint || !deployment) {
    throw new Error(
      "Missing VISION_API_KEY, AZURE_OPENAI_ENDPOINT, or AZURE_OPENAI_DEPLOYMENT in .env"
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
