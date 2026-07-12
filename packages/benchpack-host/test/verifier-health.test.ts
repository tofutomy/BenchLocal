import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { probeVerifier, waitForVerifierReady } from "../src/verifier/health-check.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("verifier health checks", () => {
  it("treats an omitted healthcheck as running without issuing a request", async () => {
    await expect(probeVerifier("http://127.0.0.1:1")).resolves.toBe("running");
  });

  it("maps successful and failed HTTP probes to verifier status", async () => {
    const server = createServer((request, response) => {
      response.writeHead(request.url === "/health" ? 204 : 503).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await expect(probeVerifier(baseUrl, "health")).resolves.toBe("running");
    await expect(probeVerifier(baseUrl, "/missing")).resolves.toBe("stopped");
  });

  it("returns false after the configured number of attempts", async () => {
    await expect(waitForVerifierReady("http://127.0.0.1:1", "/health", { attempts: 1, delayMs: 0 })).resolves.toBe(false);
  });
});
