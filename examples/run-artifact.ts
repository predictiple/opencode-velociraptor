#!/usr/bin/env bun
/**
 * Example: Run a Velociraptor artifact on a host and collect results.
 *
 * Finds the client by hostname, launches the artifact collection,
 * polls for completion, then returns the results.
 *
 * Usage:
 *   bun examples/run-artifact.ts 1oca1host Windows.System.Pslist
 *   bun examples/run-artifact.ts 1oca1host Generic.Client.Info/BasicInformation
 */
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";

const hostname = process.argv[2];
const artifactName = process.argv[3];

if (!hostname || !artifactName) {
  console.error("Usage: bun examples/run-artifact.ts <hostname> <artifact_name>");
  process.exit(1);
}

const config = loadConfig();
const client = await VelociraptorClient.create(config);

try {
  // 1. Find client ID from hostname
  console.error("[*] Searching for client:", hostname);
  const searchResult = await client.query(
    "SELECT client_id FROM clients(search=Hostname)",
    { env: { Hostname: hostname } },
  );

  if (!searchResult.rows.length) {
    console.error("[-] Cannot find any Client ID by provided hostname.");
    process.exit(1);
  }

  const cid = String(searchResult.rows[0].client_id);
  console.error(`[+] Client ID found: ${cid}`);

  // 2. Launch the artifact collection
  console.error("[*] Launching artifact:", artifactName);
  const flowResult = await client.query(
    `SELECT collect_client(client_id=CID, artifacts=ArtifactName) AS Flow FROM scope()`,
    { env: { CID: cid, ArtifactName: artifactName } },
  );

  const flowRow = flowResult.rows[0] as any;
  if (!flowRow?.Flow?.flow_id) {
    console.error("[-] Artifact not instantiated. Check name and parameters.");
    process.exit(1);
  }

  const flowId = flowRow.Flow.flow_id as string;
  console.error(`[+] Got artifact flow ID: ${flowId}`);

  // 3. Poll for results with timeout
  const timeout = 600;
  const deadline = Date.now() + timeout * 1000;
  let result: Awaited<ReturnType<typeof client.query>> | null = null;

  while (Date.now() < deadline) {
    result = await client.query(
      "SELECT * FROM source(artifact=ArtifactName, client_id=CID, flow_id=FlowID)",
      { env: { ArtifactName: artifactName, CID: cid, FlowID: flowId } },
    );

    if (result.rows.length > 0) {
      console.error(`[+] Done! (${result.rows.length} rows)`);
      break;
    }

    console.error("[*] Artifact is running...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!result || result.rows.length === 0) {
    console.error(`[-] Timeout (${timeout}s). Check artifact status manually.`);
    process.exit(1);
  }

  // 4. Print results as JSON lines
  for (const row of result.rows) {
    console.log(JSON.stringify(row));
  }
} finally {
  client.close();
}
