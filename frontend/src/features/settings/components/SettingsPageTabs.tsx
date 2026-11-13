import type { ReactNode } from "react";
import { useTabList } from "@/shared/hooks/useTabList";
import { TabList } from "@/shared/ui/TabList";

interface SettingsPageTabsProps<P extends { id: string; label: string }> {
  /** The section's name, for the tab list's accessible label. */
  label: string;
  pages: readonly P[];
  active: P["id"];
  isEdited: (page: P) => boolean;
  onSelect: (id: P["id"]) => void;
  renderPage: (page: P) => ReactNode;
}

export function SettingsPageTabs<P extends { id: string; label: string }>({
  label,
  pages,
  active,
  isEdited,
  onSelect,
  renderPage,
}: SettingsPageTabsProps<P>) {
  const tabs = useTabList(
    pages.map((page) => page.id),
    active,
    onSelect,
  );

  return (
    <>
      <TabList
        tabs={tabs}
        label={label}
        items={pages.map((page) => ({
          id: page.id,
          label: page.label,
          mark: isEdited(page) ? "unsaved" : undefined,
        }))}
        className="settings-dialog__pages"
      />
      {pages.map((page) => (
        <div key={page.id} {...tabs.panelProps(page.id)} className="settings-dialog__body">
          {renderPage(page)}
        </div>
      ))}
    </>
  );
}
