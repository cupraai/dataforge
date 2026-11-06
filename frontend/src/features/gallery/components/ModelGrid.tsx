import { useGallerySelectionContext } from "@/features/gallery/context/GallerySelectionContext";
import { modelKindStyle } from "@/features/gallery/lib/modelKind";
import { iconModel } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { formatFileSize, formatModifiedAt } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { Tooltip } from "@/shared/ui/Tooltip";
import type { GalleryItem } from "@/shared/types";

interface ModelGridProps {
  /** Every model file in the folder; the count shows how many the search left. */
  models: readonly GalleryItem[];
  shown: readonly GalleryItem[];
  onOpen: (path: string) => void;
}

/** The folder's `.safetensors` files, apart from its media. Hidden while there are none. */
export function ModelGrid({ models, shown, onOpen }: ModelGridProps) {
  const { inspectedPath } = useGallerySelectionContext();
  if (models.length === 0) return null;

  return (
    <section className="folder-section model-section" aria-label="Models">
      <SectionHeader
        section="folder"
        icon={iconModel}
        title="Models"
        count={shown.length}
        total={models.length}
      />
      {shown.length > 0 && (
        <div className="model-grid">
          {shown.map((model) => (
            <ModelCard
              key={model.path}
              model={model}
              inspected={inspectedPath === model.path}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface ModelCardProps {
  model: GalleryItem;
  /** Open in the inspector: outlined like the gallery card being inspected. */
  inspected: boolean;
  onOpen: (path: string) => void;
}

function ModelCard({ model, inspected, onOpen }: ModelCardProps) {
  const size = model.size ? formatFileSize(model.size) : null;
  const modified = model.modified_at ? formatModifiedAt(model.modified_at) : null;
  const kind = modelKindStyle(model.model_kind);
  const tone = `model-tone--${kind.tone}`;
  const meta = [size, modified].filter(Boolean).join(" · ");

  // Portalled out of the card, so it takes the hue on its own.
  const tooltip = (
    <span className={classNames("model-card__tip", tone)}>
      <span className="model-card__tip-kind">{kind.label}</span>
      <span className="model-card__tip-name">{model.name}</span>
      {meta && <span>{meta}</span>}
    </span>
  );

  return (
    <Tooltip content={tooltip} className="model-grid__cell">
      <button
        data-inspected={inspected || undefined}
        type="button"
        className={classNames("model-card", tone)}
        onClick={() => onOpen(model.path)}
        aria-label={`Open the model ${model.name}`}
      >
        <span className="model-card__tile" aria-hidden="true">
          <Icon icon={kind.icon} className="model-card__icon" />
        </span>
        <span className="model-card__body">
          <span className="model-card__name">{model.name}</span>
          <span className="model-card__meta">{[kind.label, meta].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    </Tooltip>
  );
}
