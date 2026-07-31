import fs from "node:fs/promises";
import path from "node:path";

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "output"
]);

const ignoredFiles = new Set([
  ".env"
]);

const suspiciousPatterns = [
  {
    name: "Storyblok CDN URL",
    expression: /(?:https?:\/\/)?(?:s3\.amazonaws\.com\/)?a\.storyblok\.com\/f\//i
  },
  {
    name: "Storyblok editor URL",
    expression: /app\.storyblok\.com\/#\/me\/spaces\//i
  },
  {
    name: "Possible populated management token",
    expression: /STORYBLOK_MANAGEMENT_TOKEN\s*=\s*[^\s#]+/i,
    allow: /STORYBLOK_MANAGEMENT_TOKEN\s*=\s*$/i
  }
];

async function walk(directory) {
  const entries = await fs.readdir(directory, {
    withFileTypes: true
  });

  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await walk(fullPath));
      }
      continue;
    }

    if (!ignoredFiles.has(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const files = await walk(process.cwd());
  const findings = [];

  for (const filePath of files) {
    let content;

    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const pattern of suspiciousPatterns) {
        if (
          pattern.expression.test(line) &&
          !(pattern.allow && pattern.allow.test(line))
        ) {
          findings.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            type: pattern.name
          });
        }
      }
    });
  }

  if (findings.length > 0) {
    console.error("Potential sensitive data found:");
    findings.forEach((finding) => {
      console.error(
        `${finding.file}:${finding.line} - ${finding.type}`
      );
    });
    process.exitCode = 1;
    return;
  }

  console.log("No configured sensitive-data patterns were found.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
