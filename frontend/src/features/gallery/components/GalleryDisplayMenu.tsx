import { Button } from "@/shared/ui/Button";
import { DISPLAY_MODE_OPTIONS, displayModeOption } from "@/features/gallery/lib/displayMode";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import { ariaKeyShortcuts, SHORTCUTS } from "@/shared/lib/shortcuts";
import type { GalleryDisplayMode } from "@/shared/types";
import { Menu, MenuItem } from "@/shared/ui/Menu";
import { ShortcutKeys } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

interface GalleryDisplayMenuProps {
  value: GalleryDisplayMode;
  onChange: (value: GalleryDisplayMode) => void;
}

export function GalleryDisplayMenu({ value, onChange }: GalleryDisplayMenuProps) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const active = displayModeOption(value);
  const choose = (mode: GalleryDisplayMode) => {
    if (mode !== value) onChange(mode);
  };

  useGlobalShortcut(SHORTCUTS.displayLarge, () => choose("large"));
  useGlobalShortcut(SHORTCUTS.displaySmall, () => choose("small"));
  useGlobalShortcut(SHORTCUTS.displayList, () => choose("list"));

  return (
    <div ref={rootRef} className="gallery-display-menu">
      <Tooltip content={`Display mode: ${active.label}`}>
        <Button icon={active.icon} iconOnly size="xs" aria-label="Display mode" {...triggerProps} />
      </Tooltip>

      <Menu menu={menu} label="Display mode">
        {DISPLAY_MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            kind="radio"
            icon={option.icon}
            label={option.label}
            checked={option.value === value}
            aria-label={option.ariaLabel}
            aria-keyshortcuts={ariaKeyShortcuts(option.shortcut)}
            trailing={<ShortcutKeys shortcut={option.shortcut} />}
            onSelect={() => {
              choose(option.value);
              close();
            }}
          />
        ))}
      </Menu>
    </div>
  );
}
