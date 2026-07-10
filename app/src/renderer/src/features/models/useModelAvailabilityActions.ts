import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BenchLocalConfig, ModelAvailability } from "@core";
import type { ResolvedTabModel } from "./model-config";

type Options = {
  draft: BenchLocalConfig | null;
  defaultModels: ResolvedTabModel[];
  requestRef: MutableRefObject<number>;
  pendingRef: MutableRefObject<Record<string, number>>;
  setModelAvailabilityById: Dispatch<SetStateAction<Record<string, ModelAvailability>>>;
  setCheckingModelAvailability: Dispatch<SetStateAction<Record<string, true>>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

// 隔离可用性请求的并发编号，防止较旧响应覆盖新检查结果。
export function useModelAvailabilityActions(options: Options) {
  const refreshModelAvailability = async (models: ResolvedTabModel[] = options.defaultModels) => {
    if (!options.draft || models.length === 0) return;
    const modelIds = models.map((model) => model.id);
    const requestId = options.requestRef.current + 1;
    options.requestRef.current = requestId;
    for (const modelId of modelIds) options.pendingRef.current[modelId] = requestId;
    options.setCheckingModelAvailability((current) => ({
      ...current,
      ...Object.fromEntries(modelIds.map((modelId) => [modelId, true]))
    }));

    try {
      const availability = await window.benchlocal.models.availability({ config: options.draft, modelIds });
      options.setModelAvailabilityById((current) => ({
        ...current,
        ...Object.fromEntries(
          availability
            .filter((entry) => options.pendingRef.current[entry.modelId] === requestId)
            .map((entry) => [entry.modelId, entry])
        )
      }));
    } catch (error) {
      if (modelIds.some((modelId) => options.pendingRef.current[modelId] === requestId)) {
        options.setError(error instanceof Error ? error.message : "Failed to check model availability.");
      }
    } finally {
      options.setCheckingModelAvailability((current) => {
        const next = { ...current };
        for (const modelId of modelIds) {
          if (options.pendingRef.current[modelId] !== requestId) continue;
          delete next[modelId];
          delete options.pendingRef.current[modelId];
        }
        return next;
      });
    }
  };

  return { refreshModelAvailability };
}
