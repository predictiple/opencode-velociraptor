import { describe, test, expect, beforeAll } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { VelociraptorClient } from "../src/client.ts";

const HAS_SERVER =
  process.env["VELOCIRAPTOR_API_CONFIG"] ||
  process.env["VELOCIRAPTOR_API_FILE"];

const it = HAS_SERVER ? test : test.skip;

describe("VelociraptorClient integration", () => {
  let client: VelociraptorClient;

  beforeAll(async () => {
    if (!HAS_SERVER) return;
    const config = loadConfig();
    client = await VelociraptorClient.create(config);
  });

  it("connects and runs SELECT * FROM clients()", async () => {
    const result = await client.query("SELECT * FROM clients()");
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of result.rows) {
      expect(row).toHaveProperty("client_id");
      expect(row).toHaveProperty("os_info");
    }
  });

  it("returns empty array for nonexistent data", async () => {
    const result = await client.query(
      "SELECT * FROM clients() WHERE client_id = 'C.nonexistent'",
    );
    expect(result.rows).toEqual([]);
  });

  it("accepts max_row parameter without error", async () => {
    const result = await client.query("SELECT * FROM clients()", {
      max_row: 1,
    });
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("filters out noisy status logs", async () => {
    const result = await client.query("SELECT client_id FROM clients()");
    for (const log of result.logs) {
      expect(log).not.toMatch(/^Time \d+:/);
      expect(log).not.toContain("Starting query execution");
    }
  });
});
