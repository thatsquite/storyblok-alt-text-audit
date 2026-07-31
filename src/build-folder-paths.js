import fs from "node:fs/promises";

const inputPath = "output/folders-probe.json";
const outputPath = "output/folder-paths.json";

const rawData = await fs.readFile(inputPath, "utf8");
const data = JSON.parse(rawData);

const folders =
  data.asset_folders ??
  data.folders ??
  [];

if (!Array.isArray(folders) || folders.length === 0) {
  throw new Error(
    "No folders found in output/folders-probe.json"
  );
}

const foldersById = new Map(
  folders.map((folder) => [folder.id, folder])
);

function buildFolderPath(folderId) {
  const names = [];
  const visited = new Set();

  let currentId = folderId;

  while (currentId && currentId !== 0) {
    if (visited.has(currentId)) {
      throw new Error(
        `Circular folder relationship detected at folder ${currentId}`
      );
    }

    visited.add(currentId);

    const folder = foldersById.get(currentId);

    if (!folder) {
      names.unshift(`[Missing folder ${currentId}]`);
      break;
    }

    names.unshift(folder.name);
    currentId = folder.parent_id;
  }

  return names.join(" > ");
}

const folderPaths = folders.map((folder) => ({
  id: folder.id,
  uuid: folder.uuid,
  name: folder.name,
  parent_id: folder.parent_id,
  parent_uuid: folder.parent_uuid,
  full_path: buildFolderPath(folder.id)
}));

await fs.writeFile(
  outputPath,
  JSON.stringify({ folder_paths: folderPaths }, null, 2),
  "utf8"
);

const southSudan = folderPaths.find(
  (folder) => folder.name === "South Sudan"
);

console.log("Folder paths created.");
console.log(`Folders processed: ${folderPaths.length}`);
console.log(`Saved to ${outputPath}`);

if (southSudan) {
  console.log(`Validation path: ${southSudan.full_path}`);
}