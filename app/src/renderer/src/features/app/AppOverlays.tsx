import type { BenchLocalAppMetadata, BenchLocalUpdateState } from "@/shared/desktop-api";
import { AboutDialog } from "../../shared/components/AboutDialog";
import { ConfirmDialog, type ConfirmDialogState } from "../../shared/components/ConfirmDialog";
import { HistoryModal } from "../runs/HistoryModal";
import { ResultDetailModal, type DetailModalState } from "../runs/ResultDetailModal";
import { VerifierPreparationModal } from "../runs/VerifierPreparationModal";
import { WorkspaceContextMenus, type TabContextMenuState, type WorkspaceContextMenuState } from "../workspaces/WorkspaceContextMenus";
import { WorkspaceRenameModal } from "../workspaces/WorkspaceRenameModal";
import type {
  HistoryModalState,
  SettingsVerifierPreparationModalState,
  VerifierPreparationModalState,
  WorkspaceModalState
} from "./app-state";

export function AppOverlays({
  aboutDialogOpen,
  appMetadata,
  appUpdateState,
  workspaceModal,
  historyModal,
  confirmDialog,
  settingsVerifierPreparationModal,
  verifierPreparationModal,
  stoppingVerifierStarts,
  stoppingRuns,
  workspaceContextMenu,
  tabContextMenu,
  detailModal,
  onCheckForUpdates,
  onInstallUpdate,
  onCloseAbout,
  onWorkspaceNameChange,
  onCloseWorkspaceModal,
  onSubmitWorkspaceRename,
  onCloseHistoryModal,
  onOpenHistoryRun,
  onDeleteSelectedHistory,
  onCloseConfirmDialog,
  onCancelSettingsVerifierStart,
  onStopTabRun,
  onCloseWorkspaceMenu,
  onCloseTabMenu,
  onExportWorkspace,
  onRequestDeleteWorkspace,
  onDuplicateTab,
  onRenameTab,
  onRequestCloseTab,
  onCloseDetail,
  onRetryDetail
}: {
  aboutDialogOpen: boolean;
  appMetadata: BenchLocalAppMetadata | null;
  appUpdateState: BenchLocalUpdateState | null;
  workspaceModal: WorkspaceModalState;
  historyModal: HistoryModalState | null;
  confirmDialog: ConfirmDialogState;
  settingsVerifierPreparationModal: SettingsVerifierPreparationModalState | null;
  verifierPreparationModal: VerifierPreparationModalState | null;
  stoppingVerifierStarts: Record<string, boolean>;
  stoppingRuns: Record<string, boolean>;
  workspaceContextMenu: WorkspaceContextMenuState;
  tabContextMenu: TabContextMenuState;
  detailModal: DetailModalState | null;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onCloseAbout: () => void;
  onWorkspaceNameChange: (value: string) => void;
  onCloseWorkspaceModal: () => void;
  onSubmitWorkspaceRename: () => void;
  onCloseHistoryModal: () => void;
  onOpenHistoryRun: (runId: string, mode: "history" | "replay") => void;
  onDeleteSelectedHistory: (runIds: string[]) => void;
  onCloseConfirmDialog: () => void;
  onCancelSettingsVerifierStart: (benchPackId: string) => void;
  onStopTabRun: (tabId: string) => void;
  onCloseWorkspaceMenu: () => void;
  onCloseTabMenu: () => void;
  onExportWorkspace: (workspaceId: string) => void;
  onRequestDeleteWorkspace: (workspaceId: string, workspaceName: string) => void;
  onDuplicateTab: (tabId: string) => void;
  onRenameTab: (tabId: string, tabTitle: string) => void;
  onRequestCloseTab: (tabId: string, tabTitle: string) => void;
  onCloseDetail: () => void;
  onRetryDetail: () => void;
}) {
  return (
    <>
      {aboutDialogOpen ? (
        <AboutDialog
          metadata={appMetadata}
          updateState={appUpdateState}
          onCheckForUpdates={onCheckForUpdates}
          onInstallUpdate={onInstallUpdate}
          onClose={onCloseAbout}
        />
      ) : null}

      {workspaceModal ? (
        <WorkspaceRenameModal
          name={workspaceModal.name}
          onNameChange={onWorkspaceNameChange}
          onClose={onCloseWorkspaceModal}
          onSubmit={onSubmitWorkspaceRename}
        />
      ) : null}

      {historyModal ? (
        <HistoryModal
          benchPackName={historyModal.benchPackName}
          entries={historyModal.entries}
          onClose={onCloseHistoryModal}
          onOpenRun={onOpenHistoryRun}
          onDeleteSelected={onDeleteSelectedHistory}
        />
      ) : null}

      {confirmDialog ? (
        <ConfirmDialog dialog={confirmDialog} onClose={onCloseConfirmDialog} />
      ) : null}

      {settingsVerifierPreparationModal ? (
        <VerifierPreparationModal
          benchPackName={settingsVerifierPreparationModal.progress.benchPackName}
          verifierId={settingsVerifierPreparationModal.progress.verifierId}
          message={settingsVerifierPreparationModal.progress.message}
          isCancelling={Boolean(stoppingVerifierStarts[settingsVerifierPreparationModal.benchPackId])}
          onCancel={() => onCancelSettingsVerifierStart(settingsVerifierPreparationModal.benchPackId)}
        />
      ) : verifierPreparationModal ? (
        <VerifierPreparationModal
          benchPackName={verifierPreparationModal.progress.benchPackName}
          verifierId={verifierPreparationModal.progress.verifierId}
          message={verifierPreparationModal.progress.message}
          isCancelling={Boolean(stoppingRuns[verifierPreparationModal.tabId])}
          onCancel={() => onStopTabRun(verifierPreparationModal.tabId)}
        />
      ) : null}

      <WorkspaceContextMenus
        workspaceContextMenu={workspaceContextMenu}
        tabContextMenu={tabContextMenu}
        onCloseWorkspaceMenu={onCloseWorkspaceMenu}
        onCloseTabMenu={onCloseTabMenu}
        onExportWorkspace={onExportWorkspace}
        onRequestDeleteWorkspace={onRequestDeleteWorkspace}
        onDuplicateTab={onDuplicateTab}
        onRenameTab={onRenameTab}
        onRequestCloseTab={onRequestCloseTab}
      />

      {detailModal ? (
        <ResultDetailModal detail={detailModal} onClose={onCloseDetail} onRetry={onRetryDetail} />
      ) : null}
    </>
  );
}
