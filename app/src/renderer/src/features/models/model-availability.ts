import type { ModelAvailability } from "@core";

export type ModelAvailabilityView = ModelAvailability | {
  modelId: string;
  providerId: string;
  status: "checking" | "unknown";
  reason?: ModelAvailability["reason"];
  details?: string;
  checkedAt?: string;
};

type AvailabilityModel = {
  id: string;
  provider: string;
};

export function getModelAvailabilityView(
  model: AvailabilityModel,
  availabilityByModelId: Record<string, ModelAvailability>,
  checkingModelIds: Record<string, true>
): ModelAvailabilityView {
  if (checkingModelIds[model.id]) {
    return {
      modelId: model.id,
      providerId: model.provider,
      status: "checking"
    };
  }

  return availabilityByModelId[model.id] ?? {
    modelId: model.id,
    providerId: model.provider,
    status: "unknown",
    details: "Availability has not been checked yet."
  };
}