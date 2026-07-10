import type {
  BenchLocalConfig,
  BenchLocalWorkspaceTabModelSelection,
  BenchPackRunHistoryEntry,
  GenerationRequest,
  ProgressEvent
} from "@core";
import type { BenchPackMutationProgress } from "@/shared/desktop-api";
import type { ModelFormState, ProviderFormState } from "../models/model-config";
import type { SamplingFormState } from "../models/SamplingModal";

export type LoadState = {
  path: string;
  created: boolean;
  config: BenchLocalConfig;
};

export type ProviderModalState =
  | {
      mode: "create";
      initialId?: undefined;
      form: ProviderFormState;
    }
  | {
      mode: "edit";
      initialId: string;
      form: ProviderFormState;
    };

export type ModelModalState =
  | {
      mode: "create";
      index?: undefined;
      form: ModelFormState;
    }
  | {
      mode: "edit";
      index: number;
      form: ModelFormState;
    };

export type TabModelsModalState = {
  tabId: string;
  selections: BenchLocalWorkspaceTabModelSelection[];
};

export type SamplingModalState = {
  tabId: string;
  benchPackId: string;
  benchPackName: string;
  defaults: GenerationRequest;
  form: SamplingFormState;
};

export type ModelAliasModalState = {
  tabId: string;
  modelId: string;
  baseLabel: string;
  alias: string;
};

export type HistoryModalState = {
  benchPackId: string;
  benchPackName: string;
  entries: BenchPackRunHistoryEntry[];
};

export type WorkspaceModalState =
  | {
      mode: "rename";
      workspaceId: string;
      name: string;
    }
  | null;

export type ActiveRunEntry = {
  benchPackId: string;
  mode?: "host" | "replay";
};

export type LiveScenarioFocusState = {
  liveScenarioId: string | null;
  autoFollow: boolean;
};

export type VerifierPreparingProgress = Extract<ProgressEvent, { type: "verifier_preparing" }>;

export type VerifierPreparationModalState = {
  tabId: string;
  progress: VerifierPreparingProgress;
};

export type SettingsVerifierPreparationModalState = {
  benchPackId: string;
  progress: VerifierPreparingProgress;
};

export type BenchPackMutationState = BenchPackMutationProgress;

export const THIRD_PARTY_INSTALL_MUTATION_ID = "__third_party_install__";
export const DEFAULT_BENCHLOCAL_GENERATION: GenerationRequest = { request_timeout_seconds: 300 };
