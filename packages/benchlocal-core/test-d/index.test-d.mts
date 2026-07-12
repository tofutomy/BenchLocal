import {
  createDefaultConfig,
  createDefaultWorkspaceState,
  type BenchLocalConfig,
  type BenchLocalWorkspaceState,
  type BenchPackManifest
} from "@benchlocal/core";

const config: BenchLocalConfig = createDefaultConfig();
const workspace: BenchLocalWorkspaceState = createDefaultWorkspaceState();
const manifestVersion: BenchPackManifest["schemaVersion"] = 1;

void config;
void workspace;
void manifestVersion;

// migration 属于内部实现，不能通过公共包路径深层导入。
// @ts-expect-error package exports 应阻止内部 migration 深层导入
await import("@benchlocal/core/migrations/config-v1");
