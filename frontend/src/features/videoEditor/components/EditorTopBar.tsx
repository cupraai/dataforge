import { ProgressBar } from "@/shared/ui/ProgressBar";
import { Button } from "@/shared/ui/Button";
import { IconButton } from "@/shared/ui/IconButton";
import { useState } from "react";
import {
  iconArrowLeft,
  iconCircleCheck,
  iconClapperboard,
  iconCopy,
  iconEllipsis,
  iconFolderOpen,
  iconHistory,
  iconLoader2,
  iconPanelLeftClose,
  iconPanelLeftOpen,
  iconPanelRightClose,
  iconPanelRightOpen,
  iconSettings,
  iconTrash2,
  iconTriangleAlert,
  iconUpload,
  iconX,
} from "@/shared/icons";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { classNames } from "@/shared/lib/classNames";
import { Menu, MenuItem, MenuSeparator } from "@/shared/ui/Menu";
import { Icon } from "@/shared/ui/Icon";
import { Tooltip } from "@/shared/ui/Tooltip";
import type { VideoProjectExportState } from "@/shared/types";
import type { VideoProjectState } from "@/features/videoEditor/hooks/useVideoProject";
import { ToolButton } from "./ToolButton";
import { useChanged } from "@/shared/hooks/useChanged";

interface EditorTopBarProps {
  state: VideoProjectState;
  latestExport: VideoProjectExportState | undefined;
  onCancelExport: () => void;
  onDismissExport: () => void;
  onOpenExport: () => void;
  browserOpen: boolean;
  inspectorOpen: boolean;
  onToggleBrowser: () => void;
  onToggleInspector: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpenProject: () => void;
  onSettings: () => void;
  onDuplicate: () => void;
  onVersions: () => void;
  onDelete: () => void;
  onExport: () => void;
  canExport: boolean;
  onBack: () => void;
}

/** Where the editor is going back to, what is open, how it is saved, and how it leaves as video. */
export function EditorTopBar({
  state,
  latestExport,
  onCancelExport,
  onDismissExport,
  onOpenExport,
  browserOpen,
  inspectorOpen,
  onToggleBrowser,
  onToggleInspector,
  menuOpen,
  onMenuOpenChange,
  onOpenProject,
  onSettings,
  onDuplicate,
  onVersions,
  onDelete,
  onExport,
  canExport,
  onBack,
}: EditorTopBarProps) {
  const { project } = state;
  const rate = Number(project.frame_rate.toFixed(3));
  return (
    <header className="video-editor__topbar">
      <div className="video-editor__topbar-start">
        <Button
          icon={iconArrowLeft}
          onClick={onBack}
          aria-label="Back to gallery"
          variant="text"
          size="sm"
        >
          <span>Gallery</span>
        </Button>
        <span className="video-editor__topbar-divider" aria-hidden="true" />
        <span className="video-editor__project-mark" aria-hidden="true">
          <Icon icon={iconClapperboard} />
        </span>
        <div className="video-editor__project-text">
          <ProjectName state={state} />
          <SaveStatus state={state} />
        </div>
      </div>

      <div className="video-editor__topbar-center">
        <Button
          className="video-editor__format"
          onClick={onSettings}
          aria-label={`Project settings: ${project.width} × ${project.height}, ${rate} fps`}
          size="sm"
        >
          <span>
            {project.width} × {project.height}
          </span>
          <span className="video-editor__format-dot" aria-hidden="true" />
          <span>{rate} fps</span>
        </Button>
      </div>

      <div className="video-editor__topbar-end">
        {latestExport && (
          <ExportStatus
            state={latestExport}
            onCancel={onCancelExport}
            onDismiss={onDismissExport}
            onOpen={onOpenExport}
          />
        )}
        <div className="video-editor__layout-toggles" role="group" aria-label="Panels">
          <ToolButton
            icon={browserOpen ? iconPanelLeftClose : iconPanelLeftOpen}
            label={browserOpen ? "Hide media browser" : "Show media browser"}
            tooltipPlacement="bottom"
            onClick={onToggleBrowser}
          />
          <ToolButton
            icon={inspectorOpen ? iconPanelRightClose : iconPanelRightOpen}
            label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            tooltipPlacement="bottom"
            onClick={onToggleInspector}
          />
        </div>
        <ProjectMenu
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          saved={state.path !== null}
          onOpenProject={onOpenProject}
          onSettings={onSettings}
          onDuplicate={onDuplicate}
          onVersions={onVersions}
          onDelete={onDelete}
        />
        <Button
          icon={iconUpload}
          onClick={onExport}
          disabled={!canExport}
          variant="primary"
          size="sm"
        >
          Export
        </Button>
      </div>
    </header>
  );
}

/** Renamed in place; the edit lands as one undo step when the field is left. */
function ProjectName({ state }: { state: VideoProjectState }) {
  const { project } = state;
  const [name, setName] = useState(project.name);
  if (useChanged(project.name)) {
    setName(project.name);
  }
  return (
    <Tooltip content="Rename the project">
      <input
        className="video-editor__name"
        value={name}
        aria-label="Project name"
        maxLength={120}
        size={Math.min(40, Math.max(8, name.length + 1))}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== project.name) state.commit({ ...project, name: trimmed });
          else setName(project.name);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setName(project.name);
            event.currentTarget.blur();
          }
        }}
      />
    </Tooltip>
  );
}

function SaveStatus({ state }: { state: VideoProjectState }) {
  const labels: Record<VideoProjectState["saveState"], string> = {
    new: "Not saved yet: nothing changed",
    unsaved: "Unsaved changes",
    saving: "Saving...",
    saved: "Saved",
    error: "Save failed",
    conflict: "Changed in another window",
  };
  const failed = state.saveState === "error" || state.saveState === "conflict";
  return (
    <Tooltip content={state.saveError ?? undefined}>
      <span
        className={classNames(
          "video-editor__save",
          `video-editor__save--${state.saveState}`,
          failed && "video-editor__save--failed",
        )}
        role="status"
      >
        {state.saveState === "saving" ? (
          <Icon icon={iconLoader2} spin />
        ) : failed ? (
          <Icon icon={iconTriangleAlert} />
        ) : (
          <span className="video-editor__save-dot" aria-hidden="true" />
        )}
        {labels[state.saveState]}
        {state.saveState === "error" && (
          <Button variant="text" size="xs" onClick={() => void state.flush()}>
            Retry
          </Button>
        )}
        {state.saveState === "conflict" && (
          <Button variant="text" size="xs" onClick={() => void state.saveAsCopy()}>
            Save as a new draft
          </Button>
        )}
      </span>
    </Tooltip>
  );
}

function ExportStatus({
  state,
  onCancel,
  onDismiss,
  onOpen,
}: {
  state: VideoProjectExportState;
  onCancel: () => void;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const percent = Math.round(state.progress * 100);
  return (
    <span
      className={classNames("video-editor__export", `video-editor__export--${state.status}`)}
      role="status"
    >
      {state.status === "running" && (
        <>
          <Icon icon={iconLoader2} spin />
          <span className="video-editor__export-text">
            Exporting {state.output_name} {percent}%
          </span>
          <ProgressBar className="video-editor__export-bar" value={percent} />
          <Button variant="text" size="xs" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {state.status === "completed" && (
        <>
          <Icon icon={iconCircleCheck} />
          <span className="video-editor__export-text">Exported {state.output_name}</span>
          <ExportLevel state={state} />
          <Button variant="text" size="xs" onClick={onOpen}>
            Open in gallery
          </Button>
        </>
      )}
      {state.status === "failed" && (
        <>
          <Icon icon={iconTriangleAlert} />
          <Tooltip content={state.error ?? undefined} whenTruncated>
            <span className="video-editor__export-text">Export failed: {state.error}</span>
          </Tooltip>
        </>
      )}
      {state.status === "cancelled" && (
        <span className="video-editor__export-text">Export cancelled; nothing was saved</span>
      )}
      {state.status !== "running" && (
        <IconButton
          icon={iconX}
          label="Dismiss"
          tooltip={false}
          onClick={onDismiss}
          size="xs"
          variant="ghost"
        />
      )}
    </span>
  );
}

/** What the finished file measures: integrated loudness and true peak. */
function ExportLevel({ state }: { state: VideoProjectExportState }) {
  const { loudness_lufs: lufs, true_peak_db: peak } = state;
  if (lufs == null && peak == null) return null;
  const clipped = peak != null && peak >= 0;
  const parts = [
    lufs != null && `${lufs.toFixed(1)} LUFS`,
    peak != null && `peak ${peak.toFixed(1)} dBTP`,
  ].filter(Boolean);
  return (
    <Tooltip
      content={
        clipped
          ? "The sound reaches full scale and will distort on playback. Export again with " +
            "Limit peaks or Normalize, or lower the loudest clips."
          : "Integrated loudness and true peak, measured on the exported file."
      }
    >
      <span
        className={classNames(
          "video-editor__export-level",
          clipped && "video-editor__export-level--clipped",
        )}
      >
        {parts.join(" · ")}
        {clipped && " · clipped"}
      </span>
    </Tooltip>
  );
}

/** The project's less frequent actions, deletion among them, kept out of the way of Export. */
function ProjectMenu({
  open,
  onOpenChange,
  saved,
  onOpenProject,
  onSettings,
  onDuplicate,
  onVersions,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: boolean;
  onOpenProject: () => void;
  onSettings: () => void;
  onDuplicate: () => void;
  onVersions: () => void;
  onDelete: () => void;
}) {
  const menu = usePopupMenu({ open, onOpenChange });
  const { close, rootRef, triggerProps } = menu;
  const pick = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <div ref={rootRef} className="video-editor__menu">
      <IconButton
        icon={iconEllipsis}
        label="Project actions"
        tooltipPlacement="bottom"
        size="sm"
        variant="ghost"
        {...triggerProps}
      />
      <Menu menu={menu} label="Project actions" className="video-editor__menu-panel">
        <MenuItem icon={iconFolderOpen} label="Open project..." onSelect={pick(onOpenProject)} />
        <MenuItem icon={iconSettings} label="Project settings..." onSelect={pick(onSettings)} />
        <MenuItem
          icon={iconCopy}
          label="Duplicate project"
          description="Keeps this one and continues in a copy"
          onSelect={pick(onDuplicate)}
        />
        <MenuItem
          icon={iconHistory}
          label="Versions..."
          description={saved ? undefined : "Not saved yet"}
          disabled={!saved}
          onSelect={pick(onVersions)}
        />
        <MenuSeparator />
        <MenuItem
          icon={iconTrash2}
          label="Delete project..."
          description={saved ? undefined : "Not saved yet, so nothing to delete"}
          tone="danger"
          disabled={!saved}
          onSelect={pick(onDelete)}
        />
      </Menu>
    </div>
  );
}
