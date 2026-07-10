import { Play, Square, Trash2, Wrench } from "lucide-react";
import type { BenchLocalConfig, BenchLocalVerifierConfig } from "@core";
import type { BenchPackVerifierStatus } from "@/shared/desktop-api";
import { formatVerifierRuntimeStatus } from "../runs/verifier-status";
import { InlineSelectField, Panel, SettingsTableShell } from "../../shared/components/settings-primitives";

function verifierModeLabel(mode: BenchLocalVerifierConfig["mode"]): string {
  switch (mode) {
    case "cloud":
      return "BenchLocal Cloud";
    case "custom_url":
      return "Custom URL";
    case "docker":
    default:
      return "Local Docker";
  }
}

function getVerifierStatusTone(status: BenchPackVerifierStatus["verifiers"][number]["status"] | undefined): string {
  switch (status) {
    case "running":
      return "status-ready";
    case "missing_dependency":
      return "status-not-installed";
    case "dependency_not_running":
    case "failed":
      return "status-danger";
    default:
      return "status-idle";
  }
}

export function VerificationView({
  draft,
  statuses,
  onUpdate,
  onStart,
  onStop,
  onDeleteImage
}: {
  draft: BenchLocalConfig;
  statuses: Record<string, BenchPackVerifierStatus>;
  onUpdate: (benchPackId: string, verifierId: string, updater: (verifier: BenchLocalVerifierConfig) => BenchLocalVerifierConfig) => void;
  onStart: (benchPackId: string, benchPackName: string, verifierId: string) => Promise<void>;
  onStop: (benchPackId: string) => Promise<void>;
  onDeleteImage: (benchPackId: string, benchPackName: string, verifierId: string) => void;
}) {
  const verificationEntries = Object.entries(draft.benchpacks).filter(([benchPackId]) => {
    const status = statuses[benchPackId];
    return Boolean(status && status.verifiers.length > 0);
  });

  const rows = verificationEntries.flatMap(([benchPackId, benchPack]) => {
    const status = statuses[benchPackId];
    const inspectionName = status?.benchPackName ?? benchPackId;

    return Object.entries(benchPack.verifiers ?? {}).map(([verifierId, verifier]) => {
      const runtime = status?.verifiers.find((entry) => entry.id === verifierId);
      return {
        benchPackId,
        benchPackName: inspectionName,
        verifierId,
        verifier,
        runtime,
        docker: status?.docker
      };
    });
  });

  return (
    <Panel
      title="Verification Runtimes"
      subtitle="BenchLocal manages required verifier runtimes automatically through Local Docker."
      tone="orange"
      icon={<Wrench size={16} />}
    >
      <SettingsTableShell>
        <table className="settings-list-table">
          <thead>
            <tr>
              <th>Bench Pack</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Endpoint</th>
              <th>Auto Start</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="settings-row-secondary">No installed Bench Packs currently require a verifier.</div>
                </td>
              </tr>
            ) : (
              rows.map(({ benchPackId, benchPackName, verifierId, verifier, runtime, docker }) => (
                <tr key={`${benchPackId}:${verifierId}`}>
                  <td>
                    <div className="settings-row-primary settings-nowrap-cell">{benchPackName}</div>
                  </td>
                  <td>
                    <InlineSelectField
                      label=""
                      value={verifier.mode === "docker" ? verifier.mode : "docker"}
                      options={[
                        { value: "docker", label: verifierModeLabel("docker") },
                        { value: "cloud", label: `${verifierModeLabel("cloud")} (Soon)`, disabled: true },
                        { value: "custom_url", label: `${verifierModeLabel("custom_url")} (Soon)`, disabled: true }
                      ]}
                      onChange={(value) =>
                        onUpdate(benchPackId, verifierId, (current) => ({
                          ...current,
                          mode: value as BenchLocalVerifierConfig["mode"]
                        }))
                      }
                    />
                  </td>
                  <td>
                    <span className={`status-chip ${getVerifierStatusTone(runtime?.status)}`}>
                      {formatVerifierRuntimeStatus(runtime?.status)}
                    </span>
                  </td>
                  <td>
                    <div className="settings-row-secondary">
                      {runtime?.url ?? "Managed by BenchLocal"}
                    </div>
                    <div className="settings-row-secondary">
                      Docker: {docker?.state === "ready"
                        ? docker.details ?? "ready"
                        : docker?.state === "not_running"
                          ? docker.details ?? "not running"
                          : docker?.details ?? "not installed"}
                    </div>
                  </td>
                  <td>
                    <div className="settings-table-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={verifier.auto_start}
                        onChange={(event) =>
                          onUpdate(benchPackId, verifierId, (current) => ({
                            ...current,
                            auto_start: event.target.checked
                          }))
                        }
                      />
                    </div>
                  </td>
                  <td>
                    <div className="settings-table-actions">
                      {runtime?.status === "running" ? (
                        <button type="button" onClick={() => onStop(benchPackId)} className="ghost-button ghost-button-compact">
                          <Square size={14} />
                          Stop
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStart(benchPackId, benchPackName, verifierId)}
                          className="ghost-button ghost-button-compact"
                          disabled={docker?.state !== "ready"}
                        >
                          <Play size={14} />
                          Start
                        </button>
                      )}
                      {runtime?.dockerImagePresent ? (
                        <button
                          type="button"
                          onClick={() => onDeleteImage(benchPackId, benchPackName, verifierId)}
                          className="button-danger ghost-button-compact"
                          disabled={verifier.mode !== "docker" || docker?.state !== "ready" || runtime?.status === "running"}
                        >
                          <Trash2 size={14} />
                          Delete Image
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SettingsTableShell>
    </Panel>
  );
}
