import { useId, type KeyboardEvent } from "react";
import type { ItemDraft, ShowcaseDraftState } from "@/features/automation/hooks/useShowcaseDraft";
import { describeLora } from "@/features/automation/lib/showcase";
import { optionalThumbnailUrl } from "@/features/gallery/api/media";
import { MAX_SHOWCASE_ITEMS } from "@/shared/constants";
import { iconArrowDown, iconArrowUp, iconCopy, iconTrash2 } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Checkbox } from "@/shared/ui/Checkbox";
import { IconButton } from "@/shared/ui/IconButton";

function itemMeta(item: ItemDraft): string {
  const seed = item.seedText.trim();
  const extras = item.loras.filter((lora) => lora.enabled && lora.name);
  return [
    `Strength ${item.strengthText || "?"}`,
    seed ? `Seed ${seed}` : "Random seed",
    ...extras.map((lora) => describeLora(lora.name).stem),
  ].join(" · ");
}

interface ShowcaseItemListProps {
  state: ShowcaseDraftState;
  labelledById: string;
  disabled: boolean;
}

/** Rows like the preset list's; the selected one carries its tools. */
export function ShowcaseItemList({ state, labelledById, disabled }: ShowcaseItemListProps) {
  const { items } = state.draft;
  const metaId = useId();

  // Alt+arrows move the selected item, like the workflow editor's steps.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.altKey || typeof state.selection !== "number") return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    state.moveItem(state.selection, event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    /* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- Alt+arrow reorder */
    <div className="comfy-preset-list comfy-showcase__items" onKeyDown={handleKeyDown}>
      <ol className="comfy-showcase__list" aria-labelledby={labelledById}>
        {items.map((item, index) => {
          const current = state.selection === index;
          return (
            <li
              key={item.key}
              className={classNames(
                "comfy-preset-list__item",
                "comfy-showcase__row",
                current && "comfy-preset-list__item--current",
                !item.enabled && "comfy-showcase__row--off",
              )}
            >
              <Checkbox
                className="comfy-showcase__row-toggle"
                label={<span className="comfy-showcase__hidden">Render item {index + 1}</span>}
                checked={item.enabled}
                disabled={disabled}
                onChange={(enabled) => state.updateItem(index, { enabled })}
              />
              <button
                type="button"
                className="comfy-showcase__row-main"
                aria-current={current ? "true" : undefined}
                aria-label={`${index + 1}. ${state.titleOf(index)}`}
                aria-describedby={`${metaId}-${item.key}`}
                onClick={() => state.select(index)}
              >
                <span className="comfy-preset-list__name">
                  <span className="comfy-showcase__number">{index + 1}</span>
                  {state.titleOf(index)}
                </span>
                <span id={`${metaId}-${item.key}`} className="comfy-preset-list__meta">
                  {itemMeta(item)}
                </span>
              </button>
              {item.sourcePath && (
                <img
                  className="comfy-showcase__row-thumb"
                  src={optionalThumbnailUrl(item.sourcePath, 96)}
                  alt=""
                  loading="lazy"
                />
              )}
              {current && (
                <span className="comfy-showcase__row-tools">
                  <IconButton
                    icon={iconArrowUp}
                    label="Move up"
                    size="xs"
                    variant="ghost"
                    disabled={disabled || index === 0}
                    onClick={() => state.moveItem(index, -1)}
                  />
                  <IconButton
                    icon={iconArrowDown}
                    label="Move down"
                    size="xs"
                    variant="ghost"
                    disabled={disabled || index === items.length - 1}
                    onClick={() => state.moveItem(index, 1)}
                  />
                  <IconButton
                    icon={iconCopy}
                    label="Duplicate"
                    size="xs"
                    variant="ghost"
                    disabled={disabled || items.length >= MAX_SHOWCASE_ITEMS}
                    onClick={() => state.duplicateItem(index)}
                  />
                  <IconButton
                    icon={iconTrash2}
                    label="Remove"
                    size="xs"
                    variant="ghost"
                    tone="danger"
                    disabled={disabled}
                    onClick={() => state.removeItem(index)}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
