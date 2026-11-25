import { CARD_BADGE_MODES } from "@/features/gallery/lib/cardOptions";
import { useGlobalShortcut } from "@/shared/hooks/useGlobalShortcut";
import { usePopupMenu } from "@/shared/hooks/usePopupMenu";
import {
  iconCircleDashed,
  iconCircleDot,
  iconRectangleEllipsis,
  type AppIcon,
} from "@/shared/icons";
import { ariaKeyShortcuts, SHORTCUTS, type ShortcutDefinition } from "@/shared/lib/shortcuts";
import type { CardBadgeMode } from "@/shared/types";
import { Button } from "@/shared/ui/Button";
import { Menu, MenuItem } from "@/shared/ui/Menu";
import { ShortcutKeys } from "@/shared/ui/ShortcutKeys";
import { Tooltip } from "@/shared/ui/Tooltip";

const BADGE_MODE_OPTIONS = {
  full: {
    label: "Full",
    icon: iconRectangleEllipsis,
    shortcut: SHORTCUTS.badgesFull,
  },
  compact: {
    label: "Compact",
    icon: iconCircleDot,
    shortcut: SHORTCUTS.badgesCompact,
  },
  hidden: {
    label: "Hidden",
    icon: iconCircleDashed,
    shortcut: SHORTCUTS.badgesHidden,
  },
} satisfies Record<CardBadgeMode, { label: string; icon: AppIcon; shortcut: ShortcutDefinition }>;

interface GalleryBadgeMenuProps {
  value: CardBadgeMode;
  onChange: (value: CardBadgeMode) => void;
}

export function GalleryBadgeMenu({ value, onChange }: GalleryBadgeMenuProps) {
  const menu = usePopupMenu();
  const { close, rootRef, triggerProps } = menu;
  const active = BADGE_MODE_OPTIONS[value];
  const choose = (mode: CardBadgeMode) => {
    if (mode !== value) onChange(mode);
  };

  useGlobalShortcut(SHORTCUTS.badgesFull, () => choose("full"));
  useGlobalShortcut(SHORTCUTS.badgesCompact, () => choose("compact"));
  useGlobalShortcut(SHORTCUTS.badgesHidden, () => choose("hidden"));

  return (
    <div ref={rootRef} className="gallery-display-menu gallery-display-menu--badges">
      <Tooltip content={`Card badges: ${active.label}`}>
        <Button icon={active.icon} iconOnly size="xs" aria-label="Card badges" {...triggerProps} />
      </Tooltip>

      <Menu menu={menu} label="Card badges">
        {CARD_BADGE_MODES.map((mode) => {
          const option = BADGE_MODE_OPTIONS[mode];
          return (
            <MenuItem
              key={mode}
              kind="radio"
              icon={option.icon}
              label={option.label}
              checked={mode === value}
              aria-keyshortcuts={ariaKeyShortcuts(option.shortcut)}
              trailing={<ShortcutKeys shortcut={option.shortcut} />}
              onSelect={() => {
                choose(mode);
                close();
              }}
            />
          );
        })}
      </Menu>
    </div>
  );
}
