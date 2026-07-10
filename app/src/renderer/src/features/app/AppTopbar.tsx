import type { RefObject } from "react";
import { ArrowUp, ChevronDown, Cog, Palette, Sidebar } from "lucide-react";
import type { BenchLocalThemeDescriptor, BenchPackInspection } from "@core";
import { BenchPackPickerTrigger } from "../benchpacks/BenchPackPicker";
import { resolveThemeLabel } from "../../shared/theme-format";

export function AppTopbar({
  isMacPlatform,
  sidebarOpen,
  settingsOpen,
  settingsThemeAvailable,
  agentAccessRunning,
  readyInspections,
  tabMenuOpen,
  setTabMenuOpen,
  canCreateTab,
  appUpdateDownloaded,
  downloadedUpdateVersion,
  themeMenuRef,
  themeMenuOpen,
  currentThemeLabel,
  themeOptions,
  selectedThemeId,
  availableThemes,
  systemPrefersDark,
  onToggleSidebar,
  onCreateBenchPackTab,
  onOpenSettings,
  onInstallDownloadedUpdate,
  onToggleThemeMenu,
  onSelectTheme
}: {
  isMacPlatform: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  settingsThemeAvailable: boolean;
  agentAccessRunning: boolean;
  readyInspections: BenchPackInspection[];
  tabMenuOpen: boolean;
  setTabMenuOpen: (open: boolean) => void;
  canCreateTab: boolean;
  appUpdateDownloaded: boolean;
  downloadedUpdateVersion: string | null;
  themeMenuRef: RefObject<HTMLDivElement | null>;
  themeMenuOpen: boolean;
  currentThemeLabel: string;
  themeOptions: string[];
  selectedThemeId: string;
  availableThemes: BenchLocalThemeDescriptor[];
  systemPrefersDark: boolean;
  onToggleSidebar: () => void;
  onCreateBenchPackTab: (benchPackId: string) => void;
  onOpenSettings: () => void;
  onInstallDownloadedUpdate: () => void;
  onToggleThemeMenu: () => void;
  onSelectTheme: (themeId: string) => void;
}) {
  return (
    <header className={`topbar${isMacPlatform ? "" : " topbar-nonmac"}`}>
      <div className="topbar-leading">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="toolbar-icon-button"
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <Sidebar size={16} />
        </button>
        {!isMacPlatform ? (
          <div className="app-brand">
            <h1>BenchLocal</h1>
          </div>
        ) : null}
      </div>

      <div className="topbar-main">
        {isMacPlatform ? (
          <div className="app-brand">
            <h1>BenchLocal</h1>
          </div>
        ) : null}

        {!settingsOpen ? (
          <div className="toolbar-cluster">
            {agentAccessRunning ? <span className="status-chip status-ready">Agent API</span> : null}
            <BenchPackPickerTrigger
              inspections={readyInspections}
              open={tabMenuOpen}
              setOpen={setTabMenuOpen}
              onCreateTab={onCreateBenchPackTab}
              disabled={!canCreateTab}
            />
            <button
              type="button"
              onClick={onOpenSettings}
              className="ghost-button"
              aria-label="Open settings"
              title="Settings"
            >
              <Cog size={16} />
              Settings
            </button>
            {appUpdateDownloaded ? (
              <button
                type="button"
                onClick={onInstallDownloadedUpdate}
                className="button-warn header-update-button"
                aria-label="Restart BenchLocal to install update"
                title={downloadedUpdateVersion ? `Install BenchLocal ${downloadedUpdateVersion}` : "Install BenchLocal update"}
              >
                <ArrowUp size={16} />
                Restart to Update
              </button>
            ) : null}
          </div>
        ) : settingsThemeAvailable ? (
          <div className="toolbar-cluster">
            <div ref={themeMenuRef} className="settings-theme-dropdown">
              <button
                type="button"
                className="ghost-button run-mode-button settings-theme-button"
                onClick={onToggleThemeMenu}
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
              >
                <Palette size={15} />
                <span className="settings-theme-button-label">Theme: {currentThemeLabel}</span>
                <ChevronDown size={14} />
              </button>
              {themeMenuOpen ? (
                <div className="run-mode-menu settings-theme-menu" role="menu">
                  {themeOptions.map((themeId) => (
                    <button
                      key={themeId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedThemeId === themeId}
                      className={`run-mode-menu-item${selectedThemeId === themeId ? " is-active" : ""}`}
                      onClick={() => onSelectTheme(themeId)}
                    >
                      {resolveThemeLabel(themeId, availableThemes, systemPrefersDark)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}