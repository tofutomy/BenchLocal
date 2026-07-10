import { EmptyWorkspace } from "./EmptyWorkspace";

export function AppWorkspaceEmptyState({
  providerCount,
  modelCount,
  installedBenchPackCount,
  onOpenSettingsTab,
  onSelectBenchPack
}: {
  providerCount: number;
  modelCount: number;
  installedBenchPackCount: number;
  onOpenSettingsTab: (tab: "providers" | "models" | "benchPacks") => void;
  onSelectBenchPack?: () => void;
}) {
  return (
    <EmptyWorkspace
      providerCount={providerCount}
      modelCount={modelCount}
      installedBenchPackCount={installedBenchPackCount}
      onOpenProviders={() => onOpenSettingsTab("providers")}
      onOpenModels={() => onOpenSettingsTab("models")}
      onOpenBenchPacks={() => onOpenSettingsTab("benchPacks")}
      onSelectBenchPack={onSelectBenchPack}
    />
  );
}
