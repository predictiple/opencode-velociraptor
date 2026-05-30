#!/usr/bin/env bun
/**
 * Example: Fetch a file from the Velociraptor filestore.
 *
 * Usage:
 *   bun examples/fetch.ts /downloads/C.bcb44702527bd9d0/F.D8DIIFD20NIAC/F.D8DIIFD20NIAC.zip > output.zip
 */
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";

const vfsPath = process.argv[2];
if (!vfsPath) {
  console.error("Usage: bun examples/fetch.ts <vfs_path>");
  process.exit(1);
}

const config = loadConfig();
const client = await VelociraptorClient.create(config);

try {
  const components = vfsPath.split("/").filter(Boolean);
  const data = await client.fetchBuffer(components);
  process.stdout.write(data);
} finally {
  client.close();
}
