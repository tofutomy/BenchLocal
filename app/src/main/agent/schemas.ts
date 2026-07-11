import * as z from "zod/v4";

// Agent 各传输层共享的基础输入结构集中在此处，后续 OpenAPI 与 MCP 从同一来源派生。
export const executionModeSchema = z.enum([
  "serial",
  "serial_by_model",
  "parallel_by_model",
  "parallel_by_test_case",
  "full_parallel"
]);

export const providerKindSchema = z.enum([
  "openrouter",
  "huggingface",
  "ollama",
  "llamacpp",
  "mlx",
  "lmstudio",
  "pico",
  "openai_compatible"
]);

export const generationSchema = z.object({
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  min_p: z.number().optional(),
  repetition_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  request_timeout_seconds: z.number().optional()
});

export const modelSelectionSchema = z.object({
  modelId: z.string(),
  alias: z.string().optional()
});

export type AgentGenerationInput = z.infer<typeof generationSchema>;
export type AgentModelSelectionInput = z.infer<typeof modelSelectionSchema>;
