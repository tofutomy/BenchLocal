import { useState } from "react";
import { ArrowRight, ArrowUp, FolderOpen, Plus, PlugZap, RotateCcw, Trash2 } from "lucide-react";
import type { BenchLocalConfig, BenchPackInspection, BenchPackRegistryEntry } from "@core";
import type { BenchPackMutationProgress } from "@/shared/desktop-api";
import { Banner } from "../../shared/components/Banner";
import {
  Field,
  Panel,
  SettingsTableShell
} from "../../shared/components/settings-primitives";

const THIRD_PARTY_INSTALL_MUTATION_ID = "__third_party_install__";

function benchPackMutationLabel(mutation: BenchPackMutationProgress): string {
  switch (mutation.action) {
    case "install":
      return mutation.phase === "complete" ? "Installed" : "Installing...";
    case "update":
      return mutation.phase === "complete" ? "Updated" : "Updating...";
    case "uninstall":
      return mutation.phase === "complete" ? "Removed" : "Removing...";
    default:
      return mutation.message;
  }
}

function benchPackStatusClass(status: BenchPackInspection["status"]): string {
  switch (status) {
    case "ready":
      return "status-ready";
    case "not_installed":
      return "status-not-installed";
    case "incompatible":
      return "status-load-error";
    case "manifest_missing":
    case "entry_missing":
      return "status-entry-missing";
    case "invalid_manifest":
    case "load_error":
      return "status-load-error";
  }
}

export function BenchPackRegistryView({
  draft,
  inspections,
  registryEntries,
  registryWarning,
  benchPackMutations,
  onRefresh,
  onInstall,
  onInstallFromUrl,
  onUpdate,
  onUninstall
}: {
  draft: BenchLocalConfig;
  inspections: BenchPackInspection[];
  registryEntries: BenchPackRegistryEntry[];
  registryWarning: string | null;
  benchPackMutations: Record<string, BenchPackMutationProgress>;
  onRefresh: () => void;
  onInstall: (benchPackId: string) => void;
  onInstallFromUrl: (url: string) => Promise<boolean | void>;
  onUpdate: (benchPackId: string) => void;
  onUninstall: (benchPackId: string) => void;
}) {
  const [manualUrl, setManualUrl] = useState("");
  const inspectionsById = Object.fromEntries(inspections.map((inspection) => [inspection.id, inspection]));
  const hasActiveMutation = Object.keys(benchPackMutations).length > 0;
  const officialRows = registryEntries.map((entry) => {
    const installed = draft.benchpacks[entry.id];
    const inspection = inspectionsById[entry.id];
    const mutation = benchPackMutations[entry.id];
    const updateAvailable =
      Boolean(installed) &&
      (installed?.version !== entry.version ||
        (entry.source.type === "github" ? installed?.ref !== entry.source.tag : false));

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description ?? "No description provided.",
      version: entry.version,
      installedVersion: installed?.version,
      installed: Boolean(installed),
      status: installed ? inspection?.status ?? "not_installed" : "not_installed",
      mutation,
      updateAvailable,
      isRegistryEntry: true
    } as const;
  });
  const thirdPartyRows = Object.entries(draft.benchpacks)
    .filter(([, benchPack]) => benchPack.source !== "registry")
    .map(([benchPackId, benchPack]) => {
      const inspection = inspectionsById[benchPackId];
      const mutation = benchPackMutations[benchPackId];

      return {
        id: benchPackId,
        name: inspection?.manifest?.name ?? benchPackId,
        description: inspection?.manifest?.description ?? "Installed from a third-party source maintained outside BenchLocal.",
        version: benchPack.version ?? inspection?.manifest?.version ?? "unknown",
        status: inspection?.status ?? "not_installed",
        sourceLabel:
          benchPack.source === "archive"
            ? benchPack.url ?? "Archive URL"
            : benchPack.source === "github"
              ? benchPack.repo ?? "GitHub"
              : benchPack.source === "local"
                ? benchPack.path ?? "Local path"
                : benchPack.source,
        mutation
      } as const;
    });

  return (
    <section className="settings-section-stack">
      <Panel
        title="Official Bench Pack"
        subtitle="Install and update official Bench Packs from the BenchLocal registry."
        tone="sky"
        icon={<PlugZap size={16} />}
        actions={<button type="button" onClick={onRefresh} className="ghost-button" disabled={hasActiveMutation}><RotateCcw size={14} />Refresh Registry</button>}
      >
        {registryWarning ? <Banner tone="warning">{registryWarning}</Banner> : null}
        <SettingsTableShell>
          <table className="settings-list-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {officialRows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="settings-row-secondary">
                      {registryWarning
                        ? "The official registry is currently unavailable."
                        : "No Bench Packs are available in the official registry."}
                    </div>
                  </td>
                </tr>
              ) : (
                officialRows.map((row) => {
                  const isMutating = Boolean(row.mutation);
                  const disableRowAction = hasActiveMutation && !isMutating;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="settings-row-primary settings-nowrap-cell">{row.name}</div>
                      </td>
                      <td>{row.description}</td>
                      <td>
                        <div className="benchpack-version-cell">
                          <div className="settings-table-actions settings-table-actions-inline benchpack-version-line">
                            {row.installed && row.updateAvailable && row.installedVersion ? (
                              <>
                                <span>v{row.installedVersion}</span>
                                <ArrowRight size={14} />
                                <span>v{row.version}</span>
                              </>
                            ) : (
                              <span>v{row.version}</span>
                            )}
                          </div>
                          {row.installed && row.isRegistryEntry && row.updateAvailable ? (
                            <button
                              type="button"
                              onClick={() => onUpdate(row.id)}
                              className="button-warn ghost-button-compact benchpack-upgrade-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "update" ? <span className="spinner" /> : <ArrowUp size={14} />}
                              {row.mutation?.action === "update" ? benchPackMutationLabel(row.mutation) : "Upgrade"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <span className={`status-chip ${row.installed ? benchPackStatusClass(row.status as BenchPackInspection["status"]) : "status-idle"}`}>
                          {row.mutation ? benchPackMutationLabel(row.mutation) : row.installed ? row.status.replaceAll("_", " ") : "available"}
                        </span>
                      </td>
                      <td>
                        <div className="settings-table-actions">
                          {row.installed ? (
                            <button
                              type="button"
                              onClick={() => onUninstall(row.id)}
                              className="ghost-button ghost-button-compact benchpack-action-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "uninstall" ? <span className="spinner" /> : <Trash2 size={14} />}
                              {row.mutation?.action === "uninstall" ? benchPackMutationLabel(row.mutation) : "Uninstall"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInstall(row.id)}
                              className="primary-button benchpack-action-button"
                              disabled={disableRowAction || isMutating}
                            >
                              {row.mutation?.action === "install" ? <span className="spinner" /> : <Plus size={14} />}
                              {row.mutation?.action === "install" ? benchPackMutationLabel(row.mutation) : "Install"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SettingsTableShell>
      </Panel>

      <Panel
        title="Third-Party Bench Packs"
        subtitle="Install Bench Packs from third-party sources using a direct artifact URL."
        tone="orange"
        icon={<FolderOpen size={16} />}
      >
        <div className="helper-copy">
          <p>Third-party Bench Packs are maintained by their authors, not by BenchLocal. Only install packages from sources you trust.</p>
        </div>
        <div className="benchpack-url-install-row">
          <Field
            label="Bench Pack URL"
            value={manualUrl}
            placeholder="https://example.com/my-benchpack.tar.gz"
            onChange={setManualUrl}
            className="benchpack-url-field"
          />
          <button
            type="button"
            className="primary-button benchpack-action-button"
            disabled={hasActiveMutation || !manualUrl.trim()}
            onClick={async () => {
              const installed = await onInstallFromUrl(manualUrl);

              if (installed !== false) {
                setManualUrl("");
              }
            }}
          >
            {benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID] || benchPackMutations["third-party"] ? <span className="spinner" /> : <Plus size={14} />}
            {benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID] || benchPackMutations["third-party"]
              ? benchPackMutationLabel(benchPackMutations["third-party"] ?? benchPackMutations[THIRD_PARTY_INSTALL_MUTATION_ID])
              : "Install from URL"}
          </button>
        </div>

        <SettingsTableShell>
          <table className="settings-list-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Version</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {thirdPartyRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="settings-row-secondary">No third-party Bench Packs are installed.</div>
                  </td>
                </tr>
              ) : (
                thirdPartyRows.map((row) => {
                  const isMutating = Boolean(row.mutation);
                  const disableRowAction = hasActiveMutation && !isMutating;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="settings-row-primary settings-nowrap-cell">{row.name}</div>
                      </td>
                      <td>{row.description}</td>
                      <td>v{row.version}</td>
                      <td className="settings-mono-cell">{row.sourceLabel}</td>
                      <td>
                        <span className={`status-chip ${benchPackStatusClass(row.status as BenchPackInspection["status"])}`}>
                          {row.mutation ? benchPackMutationLabel(row.mutation) : row.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <div className="settings-table-actions">
                          <button
                            type="button"
                            onClick={() => onUninstall(row.id)}
                            className="ghost-button ghost-button-compact benchpack-action-button"
                            disabled={disableRowAction || isMutating}
                          >
                            {row.mutation?.action === "uninstall" ? <span className="spinner" /> : <Trash2 size={14} />}
                            {row.mutation?.action === "uninstall" ? benchPackMutationLabel(row.mutation) : "Uninstall"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SettingsTableShell>
      </Panel>
    </section>
  );
}
