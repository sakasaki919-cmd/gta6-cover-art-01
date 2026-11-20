// VICE HEAT — Cover Art Studio
// Submission entry point: stages the offline cover maker (app/)
// and its preview shots (screenshots/) into one output directory,
// then records the whole package in dossier.json for the judges.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const studioRoot = dirname(fileURLToPath(import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Copy one folder from the repo into the staged output, creating the
// destination first so the copy never trips over a missing parent.
function stageFolder(sourceName: string, destName: string): void {
  const from = join(studioRoot, sourceName);
  const to = join(targetDir, destName);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(targetDir, { recursive: true });
stageFolder("app", "app");

if (existsSync(join(studioRoot, "screenshots"))) {
  stageFolder("screenshots", "screenshots");
} else {
  mkdirSync(join(targetDir, "screenshots"), { recursive: true });
}

const dossier = buildDossier(targetDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

// buildDossier hands back the finished dossier as raw bytes, so write
// them out verbatim — stringifying them would bloat the file and
// break the format the checker reads.
writeFileSync(join(targetDir, "dossier.json"), dossier);
