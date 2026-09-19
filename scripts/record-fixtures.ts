#!/usr/bin/env tsx
/**
 * Records live API responses into __fixtures__/ so the test suite and offline dev run against
 * real shapes (and so a future API drift shows up as a fixture diff, not a production surprise).
 *   npx tsx scripts/record-fixtures.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { C } from "../core/constants";

const DIR = path.join(process.cwd(), "__fixtures__");

async function record(name: string, url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  const file = path.join(DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(json, null, 2));
  console.log(`recorded ${file} (${JSON.stringify(json).length} bytes)`);
}

async function main() {
  await mkdir(DIR, { recursive: true });
  const recordedAt = new Date().toISOString();
  await writeFile(path.join(DIR, "README.md"), `# Fixtures\n\nRecorded from live endpoints on ${recordedAt} by \`npm run fixtures\`.\nDo not hand-edit; re-record instead.\n`);

  await record("launchpad-config", `${C.MOMO_API}/config`);
  await record("launchpad-pools-live", `${C.MOMO_API}/pools?status=live`);
  await record("launchpad-pools-all", `${C.MOMO_API}/pools?status=all`);
  await record("cookiescan-status", `${C.DAS_API}/api/status`);
  await record("cookiescan-cook", `${C.DAS_API}/api/cook`);
  await record("cookiescan-trending", `${C.DAS_API}/v1/assets/trending`);

  // DAS JSON-RPC shape
  await record("das-search-assets", `${C.DAS_API}/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "searchAssets", params: { query: "cook" } }),
  });

  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
