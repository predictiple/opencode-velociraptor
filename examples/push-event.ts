#!/usr/bin/env bun
/**
 * Example: Push events to a Velociraptor artifact queue.
 *
 * Usage:
 *   bun examples/push-event.ts Server.Audit.Logs '{"Timestamp": 1, "Message": "hello"}'
 *   bun examples/push-event.ts --client_id C.1234 Windows.Event.Monitor '{"Time": "...", "Data": "..."}'
 */
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";

let clientId = "server";
let artifact: string | undefined;
let eventData: string | undefined;
let orgId: string | undefined;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--client_id" && i + 1 < process.argv.length) {
    clientId = process.argv[++i];
  } else if (arg === "--org" && i + 1 < process.argv.length) {
    orgId = process.argv[++i];
  } else if (!artifact) {
    artifact = arg;
  } else if (!eventData) {
    eventData = arg;
  }
}

if (!artifact || !eventData) {
  console.error("Usage: bun examples/push-event.ts [--client_id id] [--org org] <artifact> <json_event>");
  process.exit(1);
}

// Normalize to JSONL (one JSON object per line)
let parsed: unknown;
try {
  parsed = JSON.parse(eventData);
} catch {
  console.error("Event must be valid JSON");
  process.exit(1);
}

const jsonl = Array.isArray(parsed)
  ? parsed.map((r) => JSON.stringify(r)).join("\n")
  : eventData;

const config = loadConfig();
const client = await VelociraptorClient.create(config);

try {
  await client.pushEvent(artifact, jsonl, { client_id: clientId, org_id: orgId });
  console.error("Event pushed successfully");
} finally {
  client.close();
}
