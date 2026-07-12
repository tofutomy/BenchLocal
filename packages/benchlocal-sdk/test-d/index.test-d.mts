import {
  BENCHLOCAL_PROTOCOL_VERSION,
  BENCHLOCAL_SCHEMA_VERSION,
  createHostHelpers,
  defineBenchPack,
  defineBenchPackManifest,
  loadBenchPackManifest,
  requireScoredResults,
  type BenchPackRuntime,
  type HostContext,
  type ScenarioResult
} from "@benchlocal/sdk";

const schemaVersion: 1 = BENCHLOCAL_SCHEMA_VERSION;
const protocolVersion: 1 = BENCHLOCAL_PROTOCOL_VERSION;
const defineRuntime: <T extends BenchPackRuntime>(runtime: T) => T = defineBenchPack;
const loadManifest: (moduleDir: string) => ReturnType<typeof defineBenchPackManifest> = loadBenchPackManifest;
const helpers = (context: HostContext) => createHostHelpers(context);
const scored = (results: ScenarioResult[]) => requireScoredResults(results);

void schemaVersion;
void protocolVersion;
void defineRuntime;
void loadManifest;
void helpers;
void scored;
