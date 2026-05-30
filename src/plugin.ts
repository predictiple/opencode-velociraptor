import { type Plugin, tool } from "@opencode-ai/plugin";
import { loadConfig, type VelociraptorConfig } from "./config.js";
import { VelociraptorClient, type QueryEnv } from "./client.js";

interface ToolContext {
  directory: string;
  worktree: string;
  agent: string;
  sessionID: string;
  messageID: string;
}

let client: VelociraptorClient | null = null;
let config: VelociraptorConfig | null = null;

function getClient(passphrase?: string): VelociraptorClient {
  if (!client) {
    config = loadConfig(passphrase);
    // client is initialized lazily; we'll init on first use
  }
  return client!;
}

async function ensureClient(passphrase?: string): Promise<VelociraptorClient> {
  if (!client) {
    config = loadConfig(passphrase);
    client = await VelociraptorClient.create(config);
  }
  return client;
}

export const velociraptorPlugin: Plugin = async () => {
  return {
    tool: {
      velociraptor_query: tool({
        description: "Run a VQL query against the Velociraptor server and return results as JSON",
        args: {
          query: tool.schema.string().describe("VQL query string to execute"),
          org_id: tool.schema.string().optional().describe("Org ID (for multi-tenant deployments)"),
          env: tool.schema.string().optional().describe("JSON object of env vars to pass to the query (e.g. {\"Foo\":\"Bar\"})"),
          timeout: tool.schema.number().optional().describe("Query timeout in seconds"),
          max_rows: tool.schema.number().optional().describe("Maximum rows to return (default: 100)"),
          passphrase: tool.schema.string().optional().describe("Passphrase for encrypted private key"),
        },
        async execute(args: { query: string; org_id?: string; env?: string; timeout?: number; max_rows?: number; passphrase?: string }, context: ToolContext) {
          const c = await ensureClient(args.passphrase);
          let env: QueryEnv | undefined;
          if (args.env) {
            try {
              env = JSON.parse(args.env);
            } catch {
              return "Error: env must be a valid JSON object";
            }
          }
          try {
            const result = await c.query(args.query, {
              env,
              org_id: args.org_id,
              timeout: args.timeout,
              max_row: args.max_rows,
            });
            const output = JSON.stringify(result.rows, null, 2);
            const logOutput = result.logs.length > 0
              ? "\n\nLogs:\n" + result.logs.join("\n")
              : "";
            return output + logOutput;
          } catch (err: any) {
            return `Error: ${err.message || err}`;
          }
        },
      }),

      velociraptor_fetch: tool({
        description: "Fetch a file from the Velociraptor filestore",
        args: {
          vfs_path: tool.schema.string().describe("VFS path components separated by / (e.g. /downloads/C.xxx/F.xxx/file.zip)"),
          org_id: tool.schema.string().optional().describe("Org ID"),
          passphrase: tool.schema.string().optional().describe("Passphrase for encrypted private key"),
        },
        async execute(args: { vfs_path: string; org_id?: string; passphrase?: string }, context: ToolContext) {
          const c = await ensureClient(args.passphrase);
          const components = args.vfs_path.split("/").filter(Boolean);
          try {
            const data = await c.fetchBuffer(components, args.org_id);
            return `Fetched ${data.length} bytes (base64): ${data.toString("base64")}`;
          } catch (err: any) {
            return `Error: ${err.message || err}`;
          }
        },
      }),

      velociraptor_push_event: tool({
        description: "Push events to a Velociraptor artifact queue",
        args: {
          artifact: tool.schema.string().describe("Artifact/queue name (e.g. Server.Audit.Logs)"),
          event: tool.schema.string().describe("JSON event data (single object or array of objects)"),
          client_id: tool.schema.string().optional().describe("Client ID (default: server)"),
          org_id: tool.schema.string().optional().describe("Org ID"),
          write: tool.schema.boolean().optional().describe("Write events to the data store"),
          passphrase: tool.schema.string().optional().describe("Passphrase for encrypted private key"),
        },
        async execute(args: { artifact: string; event: string; client_id?: string; org_id?: string; write?: boolean; passphrase?: string }, context: ToolContext) {
          const c = await ensureClient(args.passphrase);
          try {
            await c.pushEvent(args.artifact, args.event, {
              client_id: args.client_id,
              org_id: args.org_id,
              write: args.write,
            });
            return "Event pushed successfully";
          } catch (err: any) {
            return `Error: ${err.message || err}`;
          }
        },
      }),

      velociraptor_run_artifact: tool({
        description: "Run a Velociraptor artifact on a host and return results",
        args: {
          hostname: tool.schema.string().describe("Hostname to search for"),
          artifact_name: tool.schema.string().describe("Artifact name to collect (e.g. Windows.System.Pslist)"),
          artifact_params: tool.schema.string().optional().describe("JSON object of artifact parameters"),
          timeout: tool.schema.number().optional().describe("Timeout in seconds (default: 600)"),
          passphrase: tool.schema.string().optional().describe("Passphrase for encrypted private key"),
        },
        async execute(args: { hostname: string; artifact_name: string; artifact_params?: string; timeout?: number; passphrase?: string }, context: ToolContext) {
          const c = await ensureClient(args.passphrase);
          const timeout = args.timeout ?? 600;

          try {
            const clientResult = await c.query(
              "SELECT client_id FROM clients(search=Hostname)",
              { env: { Hostname: args.hostname } },
            );
            if (!clientResult.rows.length) {
              return `Error: No client found for hostname "${args.hostname}"`;
            }
            const cid = String(clientResult.rows[0].client_id);

            let paramsClause = "";
            let paramsEnv: QueryEnv = {};
            if (args.artifact_params) {
              try {
                paramsEnv = JSON.parse(args.artifact_params);
              } catch {
                return "Error: artifact_params must be a valid JSON object";
              }
            }

            const flowResult = await c.query(
              "SELECT collect_client(client_id=CID, artifacts=ArtifactName) AS Flow FROM scope()",
              {
                env: { CID: cid, ArtifactName: args.artifact_name, ...paramsEnv },
              },
            );

            if (!flowResult.rows.length || !flowResult.rows[0].Flow) {
              return "Error: Artifact not instantiated. Check name and parameters.";
            }

            const flowId = (flowResult.rows[0].Flow as any).flow_id as string;

            const deadline = Date.now() + timeout * 1000;
            let result: { rows: Record<string, unknown>[]; logs: string[] } | null = null;

            while (Date.now() < deadline) {
              result = await c.query(
                "SELECT * FROM source(artifact=ArtifactName, client_id=CID, flow_id=FlowID)",
                {
                  env: { ArtifactName: args.artifact_name, CID: cid, FlowID: flowId },
                },
              );
              if (result.rows.length > 0) break;
              await new Promise((r) => setTimeout(r, 5000));
            }

            if (!result || result.rows.length === 0) {
              return `Timeout reached (${timeout}s). Check artifact status manually.`;
            }

            return JSON.stringify(result.rows, null, 2);
          } catch (err: any) {
            return `Error: ${err.message || err}`;
          }
        },
      }),
    },
  };
};
