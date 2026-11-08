import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  type FileFilter,
  type ItemFilter,
  type MediaTypeFilter,
  type SortOption,
} from "@/features/gallery/lib/query";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import {
  iconArchive,
  iconFileBraces,
  iconFileText,
  iconFolder,
  iconMessageCheck,
  iconMessageWarning,
  iconImages,
  iconRegex,
  iconSearch,
  iconFile,
  iconX,
  type AppIcon,
} from "@/shared/icons";
import { useToolbarCompactMode } from "@/features/gallery/hooks/useToolbarCompactMode";
import { searchRegexError } from "@/features/gallery/lib/query";
import { ToolbarCompactContext } from "@/features/gallery/lib/toolbarCompact";
import { classNames } from "@/shared/lib/classNames";
import { isEditableTarget } from "@/shared/lib/isEditableTarget";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutHint } from "@/shared/ui/ShortcutKeys";
import { JobsButton } from "@/features/jobs/components/JobsButton";
import { NotificationsButton } from "@/shared/notifications/NotificationsButton";
import { StatsButton } from "./StatsButton";
import { Tooltip } from "@/shared/ui/Tooltip";
import { ToolbarFilterMenu, type RangeControls } from "./ToolbarFilterMenu";
import { ToolbarSortMenu } from "./ToolbarSortMenu";
import type { FolderInstructionsResponse } from "@/shared/types";
import { instructionFileSummary } from "@/shared/lib/instructionFileState";

interface ToolbarProps {
  /** Folder actions placed between the stats and the view controls. */
  actions?: ReactNode;
  subfolderCount: number;
  fileCount: number;
  captionedCount: number;
  issueCount?: number;
  instructions?: FolderInstructionsResponse | null;
  hasCaptionBackup?: boolean;
  statsLoading?: boolean;
  searchQuery: string;
  searchRegex: boolean;
  searchNames: boolean;
  /** Background tagging is on, so search reaches tags too. */
  searchTags?: boolean;
  sort: SortOption;
  filter: ItemFilter;
  filterCounts: Record<ItemFilter, number>;
  mediaTypeFilter: MediaTypeFilter;
  mediaTypeFilterCounts: Record<MediaTypeFilter, number>;
  fileFilter: FileFilter;
  fileFilterCounts: Record<FileFilter, number>;
  statsOpen: boolean;
  onToggleStats: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchRegexChange: (value: boolean) => void;
  onSearchNamesChange: (value: boolean) => void;
  onSortChange: (value: SortOption) => void;
  onFilterChange: (value: ItemFilter) => void;
  onMediaTypeFilterChange: (value: MediaTypeFilter) => void;
  onFileFilterChange: (value: FileFilter) => void;
  rangeControls: RangeControls;
}

interface ToolbarSearchProps {
  value: string;
  regex: boolean;
  names: boolean;
  tags: boolean;
  onQueryChange: (value: string) => void;
  onRegexChange: (value: boolean) => void;
  onNamesChange: (value: boolean) => void;
}

function searchLabel(names: boolean, tags: boolean): string {
  if (names) return `Search files and folders by name${tags ? ", caption or tag" : " or caption"}`;
  return tags ? "Search captions and tags" : "Search captions";
}

function ToolbarSearch({
  value,
  regex,
  names,
  tags,
  onQueryChange,
  onRegexChange,
  onNamesChange,
}: ToolbarSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  const hasValue = value.trim().length > 0;
  const expanded = focused || value.length > 0;
  // Checked on every keystroke, not the deferred filter value, so the field reacts at once.
  const regexError = regex ? searchRegexError(value) : null;
  const errorText = regexError && `Invalid regular expression: ${regexError}`;

  const openSearch = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  };

  useGlobalShortcut(
    SHORTCUTS.search,
    (event) => {
      // A typed slash belongs to whatever field has focus; only the Ctrl+F chord reaches in.
      if (event.key === "/" && isEditableTarget(event.target)) return false;
      openSearch();
    },
    { inEditable: true },
  );

  return (
    <Tooltip
      // The error stays up until the pattern compiles; it is the field's only explanation.
      open={Boolean(errorText)}
      content={
        errorText ? (
          <span className="toolbar__search-error">{errorText}</span>
        ) : (
          <span className="toolbar__search-help">
            <ShortcutHint shortcut={SHORTCUTS.search}>{searchLabel(false, tags)}</ShortcutHint>
            <span>
              <Icon icon={iconFile} /> Include file and folder names
            </span>
            <span>
              <Icon icon={iconRegex} /> Use regular expressions
            </span>
          </span>
        )
      }
      disabled={!errorText && expanded && focused}
    >
      {/* oxlint-disable-next-line
          jsx-a11y/click-events-have-key-events,
          jsx-a11y/no-noninteractive-element-interactions
          -- focusing the input expands it */}
      <label
        className={classNames(
          "toolbar__search",
          expanded ? "toolbar__search--expanded" : "toolbar__search--collapsed",
          hasValue && "toolbar__search--filtering",
          errorText && "toolbar__search--invalid",
        )}
        // Drives how far the expanded field grows; the width itself is clamped in CSS.
        style={{ "--toolbar-search-length": value.length } as CSSProperties}
        onClick={() => {
          if (!expanded) {
            openSearch();
          }
        }}
      >
        <Icon icon={iconSearch} className="toolbar__search-icon" />
        <span className="toolbar__search-field">
          <input
            ref={inputRef}
            type="search"
            className="toolbar__search-input"
            value={value}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search..."
            aria-label={searchLabel(names, tags)}
            aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.search)}
            aria-invalid={errorText ? true : undefined}
            aria-describedby={errorText ? errorId : undefined}
          />
          {errorText && (
            <span id={errorId} className="toolbar__search-error-text">
              {errorText}
            </span>
          )}
          <button
            type="button"
            className={classNames(
              "toolbar__search-names",
              names && "toolbar__search-names--active",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onNamesChange(!names)}
            aria-label="Match file and folder names"
            aria-pressed={names}
          >
            <Icon icon={iconFile} className="toolbar__search-names-icon" />
          </button>
          <button
            type="button"
            className={classNames(
              "toolbar__search-regex",
              regex && "toolbar__search-regex--active",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onRegexChange(!regex)}
            aria-label="Toggle regular expression search"
            aria-pressed={regex}
          >
            <Icon icon={iconRegex} className="toolbar__search-regex-icon" />
          </button>
          {hasValue && (
            <button
              type="button"
              className="toolbar__search-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
            >
              <Icon icon={iconX} className="toolbar__search-clear-icon" />
            </button>
          )}
        </span>
      </label>
    </Tooltip>
  );
}

function StatValue({ loading, value }: { loading?: boolean; value: number }) {
  if (loading) {
    return <span className="stat__value-skeleton skeleton-shimmer" aria-hidden="true" />;
  }

  return <strong>{value}</strong>;
}

function FolderMarker({
  icon,
  label,
  warning = false,
}: {
  icon: AppIcon;
  label: string;
  warning?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <span className={classNames("stat", warning && "stat--warning")} aria-label={label}>
        <Icon icon={icon} className="stat__icon" />
      </span>
    </Tooltip>
  );
}

export function Toolbar({
  actions,
  subfolderCount,
  fileCount,
  captionedCount,
  issueCount = 0,
  instructions,
  hasCaptionBackup = false,
  statsLoading = false,
  searchQuery,
  searchRegex,
  searchNames,
  searchTags = false,
  sort,
  filter,
  filterCounts,
  mediaTypeFilter,
  mediaTypeFilterCounts,
  fileFilter,
  fileFilterCounts,
  statsOpen,
  onToggleStats,
  onSearchQueryChange,
  onSearchRegexChange,
  onSearchNamesChange,
  onSortChange,
  onFilterChange,
  onMediaTypeFilterChange,
  onFileFilterChange,
  rangeControls,
}: ToolbarProps) {
  const allCaptioned = captionedCount === fileCount;
  const captionPercent =
    fileCount > 0 && !statsLoading ? Math.round((captionedCount / fileCount) * 100) : null;
  const captionedTooltip =
    captionPercent != null
      ? `${captionedCount} captioned (${captionPercent}%)`
      : `${captionedCount} captioned`;
  const issueTooltip = `${issueCount} caption ${issueCount === 1 ? "issue" : "issues"}`;
  const issueFilterActive = filter === "issue";
  const captionedFilterActive = filter === "captioned";
  // Both counts toggle their own filter, so a second click restores every file.
  const filterHint = (active: boolean, only: string) =>
    active ? "click to clear the filter" : `click to show only ${only}`;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const compact = useToolbarCompactMode(toolbarRef);
  const promptState = instructions?.sysprompt.state;
  const rulesState = instructions?.caption_rules.state;
  const hasPrompt = promptState && promptState.origin !== "missing";
  const hasRules = rulesState && rulesState.origin !== "missing";
  return (
    <div ref={toolbarRef} className={classNames("toolbar", compact && "toolbar--compact")}>
      <span className="toolbar__measure" aria-hidden="true" />
      <div
        className={classNames("toolbar__stats", statsLoading && "toolbar__stats--loading")}
        aria-busy={statsLoading || undefined}
        aria-live="polite"
      >
        <Tooltip content={`${subfolderCount} folders`}>
          <span className="stat" aria-label={`${subfolderCount} folders`}>
            <Icon icon={iconFolder} className="stat__icon" />
            <StatValue loading={statsLoading} value={subfolderCount} />
          </span>
        </Tooltip>
        <Tooltip content={`${fileCount} files`}>
          <span className="stat" aria-label={`${fileCount} files`}>
            <Icon icon={iconImages} className="stat__icon" />
            <StatValue loading={statsLoading} value={fileCount} />
          </span>
        </Tooltip>
        <Tooltip
          content={`${captionedTooltip} — ${filterHint(captionedFilterActive, "captioned files")}`}
        >
          <button
            type="button"
            className={classNames(
              `stat stat--${allCaptioned ? "success" : "warning"}`,
              "stat--filter",
            )}
            aria-label={captionedTooltip}
            aria-pressed={captionedFilterActive}
            onClick={() => onFilterChange(captionedFilterActive ? "all" : "captioned")}
          >
            <Icon icon={iconMessageCheck} className="stat__icon" />
            <StatValue loading={statsLoading} value={captionedCount} />
            {captionPercent != null && (
              <span className="stat__percent" aria-hidden="true">
                ({captionPercent}%)
              </span>
            )}
          </button>
        </Tooltip>
        {issueCount > 0 && (
          <Tooltip
            content={`${issueTooltip} — ${filterHint(issueFilterActive, "files with issues")}`}
          >
            <button
              type="button"
              className="stat stat--warning stat--filter"
              aria-label={issueTooltip}
              aria-pressed={issueFilterActive}
              onClick={() => onFilterChange(issueFilterActive ? "all" : "issue")}
            >
              <Icon icon={iconMessageWarning} className="stat__icon" />
              <StatValue loading={statsLoading} value={issueCount} />
            </button>
          </Tooltip>
        )}
        {(hasPrompt || hasRules || hasCaptionBackup) && (
          <span className="toolbar__markers">
            {hasPrompt && (
              <FolderMarker
                icon={iconFileText}
                warning={promptState.status !== "ready"}
                label={`System prompt: ${instructionFileSummary(promptState)}`}
              />
            )}
            {hasRules && (
              <FolderMarker
                icon={iconFileBraces}
                warning={rulesState.status !== "ready"}
                label={`Caption rules: ${instructionFileSummary(rulesState)}`}
              />
            )}
            {hasCaptionBackup && (
              <FolderMarker icon={iconArchive} label="This folder has backed up captions" />
            )}
          </span>
        )}
      </div>

      {actions && (
        <div className="toolbar__actions">
          <ToolbarCompactContext.Provider value={compact}>{actions}</ToolbarCompactContext.Provider>
        </div>
      )}

      <div className="toolbar__controls">
        <ToolbarSearch
          value={searchQuery}
          regex={searchRegex}
          names={searchNames}
          tags={searchTags}
          onQueryChange={onSearchQueryChange}
          onRegexChange={onSearchRegexChange}
          onNamesChange={onSearchNamesChange}
        />

        <ToolbarSortMenu value={sort} onChange={onSortChange} />

        <ToolbarFilterMenu
          searchQuery={searchQuery}
          filter={filter}
          filterCounts={filterCounts}
          mediaTypeFilter={mediaTypeFilter}
          mediaTypeFilterCounts={mediaTypeFilterCounts}
          fileFilter={fileFilter}
          fileFilterCounts={fileFilterCounts}
          onFilterChange={onFilterChange}
          onMediaTypeFilterChange={onMediaTypeFilterChange}
          onFileFilterChange={onFileFilterChange}
          {...rangeControls}
        />

        <StatsButton open={statsOpen} onToggle={onToggleStats} />

        <div className="toolbar__global">
          <NotificationsButton />
          <JobsButton />
        </div>
      </div>
    </div>
  );
}
