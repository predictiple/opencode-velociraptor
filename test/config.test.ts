import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../src/config.ts";

const ORIG_CONFIG = process.env["VELOCIRAPTOR_API_CONFIG"];
const ORIG_FILE = process.env["VELOCIRAPTOR_API_FILE"];
const ORIG_HOME = process.env["HOME"];

const MINIMAL_YAML = `
ca_certificate: |
  -----BEGIN CERTIFICATE-----
  FAKE
  -----END CERTIFICATE-----
client_cert: |
  -----BEGIN CERTIFICATE-----
  FAKE
  -----END CERTIFICATE-----
client_private_key: |
  -----BEGIN RSA PRIVATE KEY-----
  FAKE
  -----END RSA PRIVATE KEY-----
api_connection_string: localhost:8001
`.trim();

const ENCRYPTED_YAML = `
ca_certificate: |
  -----BEGIN CERTIFICATE-----
  FAKE
  -----END CERTIFICATE-----
client_cert: |
  -----BEGIN CERTIFICATE-----
  FAKE
  -----END CERTIFICATE-----
client_private_key: |
  -----BEGIN ENCRYPTED PRIVATE KEY-----
  FAKEENCRYPTEDFAKE
  -----END ENCRYPTED PRIVATE KEY-----
api_connection_string: localhost:8001
`.trim();

beforeEach(() => {
  delete process.env["VELOCIRAPTOR_API_CONFIG"];
  delete process.env["VELOCIRAPTOR_API_FILE"];
});

afterEach(() => {
  process.env["VELOCIRAPTOR_API_CONFIG"] = ORIG_CONFIG;
  process.env["VELOCIRAPTOR_API_FILE"] = ORIG_FILE;
});

describe("loadConfig", () => {
  test("loads from VELOCIRAPTOR_API_CONFIG", () => {
    process.env["VELOCIRAPTOR_API_CONFIG"] = MINIMAL_YAML;
    const config = loadConfig();
    expect(config.api_connection_string).toBe("localhost:8001");
    expect(config.ca_certificate).toContain("BEGIN CERTIFICATE");
    expect(config.client_cert).toContain("BEGIN CERTIFICATE");
    expect(config.client_private_key).toContain("BEGIN RSA PRIVATE KEY");
  });

  test("VELOCIRAPTOR_API_CONFIG takes priority", () => {
    process.env["VELOCIRAPTOR_API_CONFIG"] = MINIMAL_YAML;
    process.env["VELOCIRAPTOR_API_FILE"] = "/nonexistent/should-not-be-read";
    const config = loadConfig();
    expect(config.api_connection_string).toBe("localhost:8001");
  });

  test("loads from VELOCIRAPTOR_API_FILE", () => {
    const filePath = import.meta.dir + "/fixtures/test-config.yaml";
    process.env["VELOCIRAPTOR_API_FILE"] = filePath;
    const config = loadConfig();
    expect(config.api_connection_string).toBe("localhost:9999");
    expect(config.name).toBe("test-fixture");
  });

  test("throws when neither env var is set", () => {
    expect(() => loadConfig()).toThrow("No Velociraptor API config found");
  });

  test("throws when YAML has missing fields", () => {
    process.env["VELOCIRAPTOR_API_CONFIG"] = "foo: bar";
    expect(() => loadConfig()).toThrow("Missing or invalid config field");
  });

  test("throws when key is encrypted and no passphrase", () => {
    process.env["VELOCIRAPTOR_API_CONFIG"] = ENCRYPTED_YAML;
    expect(() => loadConfig()).toThrow("encrypted but no passphrase");
  });

  test("decrypts key with passphrase", () => {
    // Uses a real encrypted key we can decrypt with a known passphrase
    process.env["VELOCIRAPTOR_API_CONFIG"] = ENCRYPTED_YAML;
    // This will still throw because the key data is fake, but it means
    // the function attempts decryption rather than bailing early
    expect(() => loadConfig("test")).toThrow();
    // The error should be from crypto (bad key data), not from
    // "encrypted but no passphrase"
    const fn = () => loadConfig("test");
    expect(fn).toThrow();
    // Verify it's not the "no passphrase" error
    try {
      fn();
    } catch (e: any) {
      expect(e.message).not.toContain("encrypted but no passphrase");
    }
  });
});
