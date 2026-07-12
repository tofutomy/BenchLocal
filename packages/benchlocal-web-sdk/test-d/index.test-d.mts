import {
  BENCHLOCAL_WEB_BRIDGE_VERSION,
  createBenchLocalClient,
  type BenchLocalChatRequest,
  type BenchLocalWebClient,
  type BenchLocalWebEnvironmentInfo
} from "@benchlocal/web-sdk";

const bridgeVersion: 1 = BENCHLOCAL_WEB_BRIDGE_VERSION;
const client: BenchLocalWebClient = createBenchLocalClient({ requestTimeoutMs: 1_000 });
const detect: Promise<BenchLocalWebEnvironmentInfo> = client.environment.detect();
const request: BenchLocalChatRequest = {
  modelId: "model-a",
  messages: [{ role: "user", content: "hello" }]
};
const stream: AsyncIterable<unknown> = client.inference.streamChat(request);

void bridgeVersion;
void detect;
void stream;
