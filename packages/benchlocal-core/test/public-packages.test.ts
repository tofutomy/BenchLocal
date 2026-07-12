import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

type PackageManifest = {
  name: string;
  private?: boolean;
  main?: string;
  types?: string;
  files?: string[];
  exports?: Record<string, { import?: string; require?: string; types?: string }>;
  publishConfig?: { access?: string };
  dependencies?: Record<string, string>;
};

async function readManifest(relativePath: string): Promise<PackageManifest> {
  return JSON.parse(await fs.readFile(path.resolve(relativePath, "package.json"), "utf8")) as PackageManifest;
}

describe("public package boundaries", () => {
  it("publishes exactly the documented ecosystem packages through root exports", async () => {
    const publicPackages = await Promise.all([
      readManifest("packages/benchlocal-core"),
      readManifest("packages/benchlocal-sdk"),
      readManifest("packages/benchlocal-web-sdk")
    ]);

    expect(publicPackages.map(({ name }) => name)).toEqual([
      "@benchlocal/core",
      "@benchlocal/sdk",
      "@benchlocal/web-sdk"
    ]);
    for (const manifest of publicPackages) {
      expect(manifest.private).not.toBe(true);
      expect(manifest.publishConfig?.access).toBe("public");
      expect(manifest.files).toContain("dist");
      expect(manifest.main).toBe("dist/index.js");
      expect(manifest.types).toBe("dist/index.d.ts");
      expect(Object.keys(manifest.exports ?? {})).toEqual(["."]);
      expect(manifest.exports?.["."]?.types).toBe("./dist/index.d.ts");
      expect(manifest.dependencies).not.toHaveProperty("@benchlocal/benchpack-host");
    }
  });

  it("keeps the desktop host package private", async () => {
    const host = await readManifest("packages/benchpack-host");
    expect(host.name).toBe("@benchlocal/benchpack-host");
    expect(host.private).toBe(true);
    expect(host.publishConfig).toBeUndefined();
  });
});
