import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import * as yaml from "js-yaml";

export interface VelociraptorConfig {
  ca_certificate: string;
  client_cert: string;
  client_private_key: string;
  api_connection_string: string;
  name?: string;
}

function loadYaml(text: string): VelociraptorConfig {
  const doc = yaml.load(text);
  if (!doc || typeof doc !== "object") {
    throw new Error("Config is not a valid YAML object");
  }
  const config = doc as Record<string, unknown>;
  for (const key of ["ca_certificate", "client_cert", "client_private_key", "api_connection_string"]) {
    if (!config[key] || typeof config[key] !== "string") {
      throw new Error(`Missing or invalid config field: ${key}`);
    }
  }
  return config as unknown as VelociraptorConfig;
}

function readConfigFile(path: string): VelociraptorConfig {
  const text = readFileSync(path, "utf-8");
  return loadYaml(text);
}

function decryptPrivateKey(pem: string, passphrase: string): string {
  const key = createPrivateKey({ key: pem, format: "pem", passphrase });
  return key.export({ type: "pkcs1", format: "pem" }).toString();
}

export function loadConfig(passphrase?: string): VelociraptorConfig {
  const envConfig = process.env["VELOCIRAPTOR_API_CONFIG"];
  if (envConfig) {
    const config = loadYaml(envConfig);
    if (config.client_private_key.includes("ENCRYPTED")) {
      if (!passphrase) {
        throw new Error("Private key is encrypted but no passphrase provided");
      }
      config.client_private_key = decryptPrivateKey(config.client_private_key, passphrase);
    }
    return config;
  }

  const configFile = process.env["VELOCIRAPTOR_API_FILE"];
  if (configFile) {
    const config = readConfigFile(configFile);
    if (config.client_private_key.includes("ENCRYPTED")) {
      if (!passphrase) {
        throw new Error("Private key is encrypted but no passphrase provided");
      }
      config.client_private_key = decryptPrivateKey(config.client_private_key, passphrase);
    }
    return config;
  }

  throw new Error(
    "No Velociraptor API config found. Set VELOCIRAPTOR_API_CONFIG or VELOCIRAPTOR_API_FILE."
  );
}
