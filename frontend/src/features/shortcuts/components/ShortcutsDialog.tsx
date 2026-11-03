import {
  iconFolder,
  iconImage,
  iconKeyboard,
  iconLayoutGrid,
  iconListChecks,
  iconPencil,
  type AppIcon,
} from "@/shared/icons";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutDefinition,
  type ShortcutGroup,
} from "@/shared/lib/shortcuts";
import { Dialog } from "@/shared/ui/Dialog";
import { Icon } from "@/shared/ui/Icon";
import { ShortcutKeys } from "@/shared/ui/ShortcutKeys";

const SHORTCUT_LIST: readonly ShortcutDefinition[] = Object.values(SHORTCUTS);

// Ordered so the column flow balances: short groups share a column, the item viewer has its own.
// The video editor lists its own keys in its inspector.
const LISTED_GROUPS: readonly { id: ShortcutGroup; icon: AppIcon }[] = [
  { id: "global", icon: iconKeyboard },
  { id: "folders", icon: iconFolder },
  { id: "review", icon: iconListChecks },
  { id: "selection", icon: iconLayoutGrid },
  { id: "editors", icon: iconPencil },
  { id: "viewer", icon: iconImage },
];

const GROUP_LABELS = Object.fromEntries(
  SHORTCUT_GROUPS.map((group) => [group.id, group.label]),
) as Record<ShortcutGroup, string>;

interface ShortcutsDialogProps {
  onClose: () => void;
}

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      role="dialog"
      panelClassName="shortcuts-dialog"
      onClose={onClose}
    >
      <div className="shortcuts-dialog__groups">
        {LISTED_GROUPS.map((group) => (
          <section
            key={group.id}
            className="shortcuts-dialog__group"
            aria-label={GROUP_LABELS[group.id]}
          >
            <h3 className="shortcuts-dialog__group-label">
              <Icon icon={group.icon} className="shortcuts-dialog__group-icon" />
              {GROUP_LABELS[group.id]}
            </h3>
            <dl className="shortcuts-dialog__list">
              {SHORTCUT_LIST.filter((shortcut) => shortcut.group === group.id).map((shortcut) => (
                <div key={shortcut.label} className="shortcuts-dialog__row">
                  <dt className="shortcuts-dialog__label">{shortcut.label}</dt>
                  <dd className="shortcuts-dialog__keys">
                    <ShortcutKeys shortcut={shortcut} announce />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
