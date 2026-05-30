#!/usr/bin/env bun
/**
 * Example: Run a VQL query against the Velociraptor server.
 *
 * Usage:
 *   bun examples/query.ts "SELECT * FROM clients()"
 *   bun examples/query.ts "SELECT * FROM info()"
 *   bun examples/query.ts --env Hostname=myhost "SELECT client_id FROM clients(search=Hostname)"
 */
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";

const query = process.argv[2];
if (!query) {
  console.error("Usage: bun examples/query.ts [--env Key=Val ...] <VQL query>");
  process.exit(1);
}

const env: Record<string, string> = {};
let queryIndex = 2;
while (queryIndex < process.argv.length - 1) {
  const arg = process.argv[queryIndex];
  if (arg === "--env") {
    const pair = process.argv[queryIndex + 1];
    const eq = pair.indexOf("=");
    if (eq > 0) {
      env[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    queryIndex += 2;
  } else {
    break;
  }
}

const config = loadConfig();
const client = await VelociraptorClient.create(config);

try {
  const result = await client.query(query, { env });
  for (const row of result.rows) {
    console.log(JSON.stringify(row));
  }
  for (const log of result.logs) {
    console.error(log.trimEnd());
  }
} finally {
  client.close();
}
