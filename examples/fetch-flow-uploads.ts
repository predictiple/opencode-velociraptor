#!/usr/bin/env bun
/**
 * Example: Fetch all uploaded files from a Velociraptor flow.
 *
 * First queries the server for all uploads in a flow, then fetches
 * each file and writes it to the output directory.
 *
 * Usage:
 *   bun examples/fetch-flow-uploads.ts C.bcb44702527bd9d0 F.BVSSIUHNPUV7E
 *   bun examples/fetch-flow-uploads.ts --zip C.bcb44702527bd9d0 F.BVSSIUHNPUV7E
 */
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let clientId: string | undefined;
let flowId: string | undefined;
let exportZip = false;
let outputDir = "/tmp";

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--zip") {
    exportZip = true;
  } else if (arg === "--output" && i + 1 < process.argv.length) {
    outputDir = process.argv[++i];
  } else if (!clientId) {
    clientId = arg;
  } else if (!flowId) {
    flowId = arg;
  }
}

if (!clientId || !flowId) {
  console.error("Usage: bun examples/fetch-flow-uploads.ts [--zip] [--output dir] <client_id> <flow_id>");
  process.exit(1);
}

const config = loadConfig();
const client = await VelociraptorClient.create(config);

try {
  let query: string;
  if (exportZip) {
    query = `
      SELECT create_flow_download(wait=TRUE,
        client_id=ClientId, flow_id=FlowId).Components AS Components
      FROM scope()
    `;
  } else {
    query = `
      SELECT Upload.Components AS Components
      FROM uploads(flow_id=FlowId, client_id=ClientId)
    `;
  }

  const result = await client.query(query, {
    env: { FlowId: flowId, ClientId: clientId },
  });

  mkdirSync(outputDir, { recursive: true });

  for (const row of result.rows) {
    const components = (row as any).Components as string[];
    if (!components?.length) continue;

    const filename = components[components.length - 1];
    const outPath = join(outputDir, filename);
    console.error(`Fetching ${components.join("/")} → ${outPath}`);

    const data = await client.fetchBuffer(components);
    writeFileSync(outPath, data);
  }

  console.error("Done.");
} finally {
  client.close();
}
