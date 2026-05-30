# Velociraptor TypeScript Bindings

TypeScript bindings for the
[Velociraptor](https://docs.velociraptor.app/) DFIR server API,
packaged as an [opencode](https://opencode.ai) plugin.

> [!WARNING]
> This is experimental and NOT an official Velociraptor project. Use at your own risk!

---

Velociraptor exposes a gRPC API with the following stable endpoints:

1. **Query** — Run arbitrary VQL queries. This can be used to automate collection, analysis, and receive JSON-encoded results.
2. **VFSGetBuffer** — Read arbitrary buffers from the Velociraptor filestore. Allows client programs to fetch bulk collected data.
3. **PushEvents** — Push events to artifact queues.

You can use these endpoints to:

- Control collection from Velociraptor: start hunts, collections, trigger exports, etc. — all with VQL over the Query endpoint.
- Perform administrative tasks: spawn new orgs, add users, adjust permissions, create periodic tasks, etc.
- Read results from collected data using VFSGetBuffer.
- Ingest external events into Velociraptor using PushEvents.

To read more about the Velociraptor API see the [Server Automation docs](https://docs.velociraptor.app/docs/server_automation/server_api/).

## Installation

```bash
git clone https://github.com/predictiple/opencode-velociraptor
cd opencode-velociraptor
bun install
```

The `postinstall` script automatically builds the TypeScript. The plugin is then auto-discovered from `.opencode/plugins/velociraptor.ts` on next opencode restart — no config entry needed.

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.x+)
- [opencode](https://opencode.ai)
- A Velociraptor API client config (see Configuration below)

## opencode plugin

Registers 4 custom tools for use in opencode conversations:

| Tool | Description |
|---|---|
| `velociraptor_query` | Run arbitrary VQL queries against the server |
| `velociraptor_fetch` | Fetch files from the Velociraptor filestore |
| `velociraptor_push_event` | Push events to artifact queues |
| `velociraptor_run_artifact` | Find client by hostname, run artifact, poll for results |

Auto-discovered from `.opencode/plugins/velociraptor.ts` — no config entry needed.

## Configuration

Config is loaded from (in priority order):

1. `VELOCIRAPTOR_API_CONFIG` env var — raw YAML string
2. `VELOCIRAPTOR_API_FILE` env var — path to YAML config file

Generate a config file from your Velociraptor server:

    velociraptor --config server.config.yaml config api_client --name opencode > api.config.yaml

Then either `export VELOCIRAPTOR_API_FILE=/path/to/api.config.yaml` or paste its content into `VELOCIRAPTOR_API_CONFIG`.

## Keeping the proto in sync

This project uses dynamic protobuf loading (no code-gen), so `proto/api.proto` **is** the API contract. If the upstream [pyvelociraptor](https://github.com/Velociraptor/pyvelociraptor) project updates `api.proto`, sync manually:

```bash
# 1. Fetch the latest proto from upstream
curl -O https://raw.githubusercontent.com/Velociraptor/pyvelociraptor/main/pyvelociraptor/api.proto

# 2. Check for changes
diff proto/api.proto api.proto

# 3. If changes look correct, replace
mv api.proto proto/api.proto

# 4. Verify the client still compiles and works
bun run build
bun examples/query.ts "SELECT * FROM clients()"
```

Things to watch for when reviewing diffs:

- **New RPC methods** — add a matching method in `src/client.ts`
- **Changed field names/types** — update the client or the tool args in `src/plugin.ts`
- **Removed fields/methods** — update the client accordingly

## Sample programs

You will find sample programs in the `examples/` directory:

- **examples/query.ts**: Run a VQL query against the server and display the resulting JSON data, including query logs.
- **examples/fetch.ts**: Fetch a file from the server's filestore in chunks using VFSGetBuffer.
- **examples/fetch-flow-uploads.ts**: Combine Query and VFSGetBuffer to list and fetch all uploads from a flow.
- **examples/push-event.ts**: Push JSON events to an artifact queue.
- **examples/run-artifact.ts**: High-level script that finds a client by hostname, launches an artifact collection, and polls for results.

All examples run with `bun examples/<name>.ts <args>`.

## Licensing

Velociraptor itself is licensed under AGPL, however use of the API does not fall under the "derived work" definition. This TypeScript implementation is MIT licensed, matching the original Python bindings.

## Tech

- gRPC via `@grpc/grpc-js` with mTLS authentication
- Protobuf via `protobufjs` (dynamic loading, no code-gen)
- mTLS: CA cert, client cert, and encrypted/unencrypted private key

## Usage

### In opencode conversations

Once the plugin is loaded, the LLM can call these tools directly. Prompt it with something like:

- "Run `SELECT * FROM clients()` against the Velociraptor server"
- "Fetch the file at `/downloads/C.bcb44702527bd9d0/F.D8DIIFD20NIAC/F.D8DIIFD20NIAC.zip`"
- "Push this event to the `Server.Audit.Logs` queue: `{"Timestamp": 1, "Message": "hello"}`"
- "Run the `Windows.System.Pslist` artifact on host `1oca1host`"

### As standalone CLI scripts

```bash
# Run a VQL query
bun examples/query.ts "SELECT * FROM clients()"

# Pass env vars to the query
bun examples/query.ts --env Hostname=myhost "SELECT client_id FROM clients(search=Hostname)"

# Fetch a file from the filestore
bun examples/fetch.ts /downloads/C.bcb44702527bd9d0/F.D8DIIFD20NIAC/F.D8DIIFD20NIAC.zip > output.zip

# Fetch all uploads from a flow
bun examples/fetch-flow-uploads.ts C.bcb44702527bd9d0 F.BVSSIUHNPUV7E
bun examples/fetch-flow-uploads.ts --zip C.bcb44702527bd9d0 F.BVSSIUHNPUV7E

# Push an event to an artifact queue
bun examples/push-event.ts Server.Audit.Logs '{"Timestamp": 1, "Message": "test"}'

# Run an artifact on a host and collect results
bun examples/run-artifact.ts 1oca1host Windows.System.Pslist
```

### As a library

```typescript
import { loadConfig, VelociraptorClient } from "velociraptor";

const config = loadConfig();
const client = await VelociraptorClient.create(config);

// Run a query
const { rows, logs } = await client.query("SELECT * FROM clients()");

// Fetch a file
const data = await client.fetchBuffer(["downloads", "C.xxx", "F.xxx", "file.zip"]);

// Push an event
await client.pushEvent("Server.Audit.Logs", JSON.stringify({ msg: "hello" }));

client.close();
```

## License

MIT
