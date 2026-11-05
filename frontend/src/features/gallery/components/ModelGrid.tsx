import { optionalThumbnailUrl } from "@/features/gallery/api/media";
import { useGallerySelectionContext } from "@/features/gallery/context/GallerySelectionContext";
import { mediaCacheKey } from "@/features/gallery/lib/thumbnail";
import { iconModel } from "@/shared/icons";
import { formatFileSize, formatModifiedAt } from "@/shared/lib/format";
import { Icon } from "@/shared/ui/Icon";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { Tooltip } from "@/shared/ui/Tooltip";
import type { GalleryItem } from "@/shared/types";

const MODEL_THUMBNAIL_WIDTH = 200;

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
  const preview = model.preview;
  const meta = [size, modified].filter(Boolean).join(" · ");

  const tooltip = (
    <span className="model-card__tip">
      <span className="model-card__tip-name">{model.name}</span>
      {meta && <span>{meta}</span>}
    </span>
  );

  return (
    <Tooltip content={tooltip} className="model-grid__cell">
      <button
        data-inspected={inspected || undefined}
        type="button"
        className="model-card"
        onClick={() => onOpen(model.path)}
        aria-label={`Open the model ${model.name}`}
      >
        <span className="model-card__tile" aria-hidden="true">
          {preview ? (
            <img
              src={optionalThumbnailUrl(
                preview.path,
                MODEL_THUMBNAIL_WIDTH,
                mediaCacheKey(preview.modified_at, preview.size),
              )}
              alt=""
              loading="lazy"
            />
          ) : (
            <Icon icon={iconModel} className="model-card__icon" />
          )}
        </span>
        <span className="model-card__body">
          <span className="model-card__name">{model.name}</span>
          {meta && <span className="model-card__meta">{meta}</span>}
        </span>
      </button>
    </Tooltip>
  );
}
