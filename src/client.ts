import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { VelociraptorConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface QueryEnv {
  [key: string]: string;
}

export class VelociraptorClient {
  private client: grpc.Client;
  private static serviceDef: any = null;

  private constructor(client: grpc.Client) {
    this.client = client;
  }

  static async create(config: VelociraptorConfig): Promise<VelociraptorClient> {
    if (!VelociraptorClient.serviceDef) {
      VelociraptorClient.serviceDef = await buildServiceDefinition();
    }

    const creds = grpc.credentials.createSsl(
      Buffer.from(config.ca_certificate),
      Buffer.from(config.client_private_key),
      Buffer.from(config.client_cert),
    );

    const options: grpc.ChannelOptions = {
      "grpc.ssl_target_name_override": "VelociraptorServer",
      "grpc.keepalive_time_ms": 120000,
    };

    const ClientClass = grpc.makeGenericClientConstructor(
      VelociraptorClient.serviceDef,
      "proto.API",
    );
    const client = new ClientClass(
      config.api_connection_string,
      creds,
      options,
    );

    return new VelociraptorClient(client);
  }

  async query(
    vql: string,
    opts?: {
      env?: QueryEnv;
      org_id?: string;
      max_wait?: number;
      max_row?: number;
      timeout?: number;
    },
  ): Promise<{ rows: Record<string, unknown>[]; logs: string[] }> {
    const env = Object.entries(opts?.env ?? {}).map(([key, value]) => ({
      key,
      value: String(value),
    }));

    const request = {
      org_id: opts?.org_id ?? "",
      max_wait: opts?.max_wait ?? 1,
      max_row: opts?.max_row ?? 100,
      timeout: opts?.timeout ?? 0,
      Query: [{ Name: "Query", VQL: vql }],
      env,
    };

    const rows: Record<string, unknown>[] = [];
    const logs: string[] = [];

    return new Promise((resolve, reject) => {
      const call = this.client.makeServerStreamRequest(
        "/proto.API/Query",
        (value: any) => encodeMessage("VQLCollectorArgs", value),
        (data: Buffer) => decodeMessage("VQLResponse", data),
        request,
      );

      call.on("data", (response: any) => {
        if (response.Response) {
          try {
            const parsed = JSON.parse(response.Response);
            rows.push(...parsed);
          } catch {
            // skip malformed response
          }
        }
        if (response.log) {
          const msg = response.log.trimEnd();
          if (!msg.includes("Starting query execution") &&
              !msg.match(/^Time \d+:.*Sending response part/)) {
            logs.push(msg);
          }
        }
      });

      call.on("error", (err: Error) => {
        reject(err);
      });

      call.on("end", () => {
        resolve({ rows, logs });
      });
    });
  }

  async fetchBuffer(
    components: string[],
    org_id?: string,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let offset = 0;
    const length = 1024 * 1024; // 1MB chunks

    while (true) {
      const request = {
        org_id: org_id ?? "",
        components,
        offset,
        length,
      };

      const data = await new Promise<Buffer>((resolve, reject) => {
        this.client.makeUnaryRequest(
          "/proto.API/VFSGetBuffer",
          (value: any) => encodeMessage("VFSFileBuffer", value),
          (data: Buffer) => decodeMessage("VFSFileBuffer", data),
          request,
          (err, response: any) => {
            if (err) reject(err);
            else resolve(Buffer.from(response.data as Uint8Array));
          },
        );
      });

      if (data.length === 0) break;
      chunks.push(data);
      offset += data.length;
    }

    return Buffer.concat(chunks);
  }

  async pushEvent(
    artifact: string,
    jsonl: string,
    opts?: {
      client_id?: string;
      flow_id?: string;
      org_id?: string;
      write?: boolean;
    },
  ): Promise<void> {
    const request = {
      artifact,
      client_id: opts?.client_id ?? "",
      flow_id: opts?.flow_id ?? "",
      jsonl: Buffer.from(jsonl),
      rows: jsonl.trim().split("\n").filter(Boolean).length,
      org_id: opts?.org_id ?? "",
      write: opts?.write ?? false,
    };

    await new Promise<void>((resolve, reject) => {
      this.client.makeUnaryRequest(
        "/proto.API/PushEvents",
        (value: any) => encodeMessage("PushEventRequest", value),
        () => ({}),
        request,
        (err: grpc.ServiceError | null) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  close(): void {
    this.client.close();
  }
}

let protoRoot: protobuf.Root | null = null;

async function getProtoRoot(): Promise<protobuf.Root> {
  if (!protoRoot) {
    protoRoot = await protobuf.load(
      resolve(__dirname, "..", "proto", "api.proto"),
    );
  }
  return protoRoot;
}

function encodeMessage(typeName: string, value: any): Buffer {
  const type = getProtoType(typeName);
  const message = type.fromObject(value);
  return Buffer.from(type.encode(message).finish());
}

function decodeMessage(typeName: string, data: Buffer): any {
  const type = getProtoType(typeName);
  return type.decode(data);
}

function getProtoType(typeName: string): protobuf.Type {
  if (!protoRoot) {
    throw new Error("Proto not loaded yet");
  }
  const type = protoRoot.lookupType(typeName);
  return type;
}

async function buildServiceDefinition(): Promise<any> {
  const root = await getProtoRoot();
  const service = root.lookupService("proto.API");
  const def: Record<string, any> = {};

  for (const [name, method] of Object.entries(service.methods)) {
    const m = method as protobuf.Method;
    def[name] = {
      path: `/proto.API/${name}`,
      requestStream: !!m.requestStream,
      responseStream: !!m.responseStream,
      requestSerialize: (v: any) =>
        Buffer.from(m.resolvedRequestType!.encode(m.resolvedRequestType!.fromObject(v)).finish()),
      requestDeserialize: (data: Buffer) =>
        m.resolvedRequestType!.decode(data),
      responseSerialize: (v: any) =>
        Buffer.from(m.resolvedResponseType!.encode(m.resolvedResponseType!.fromObject(v)).finish()),
      responseDeserialize: (data: Buffer) =>
        m.resolvedResponseType!.decode(data),
    } as grpc.MethodDefinition<any, any>;
  }

  return def;
}
