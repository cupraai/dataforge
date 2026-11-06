import { useModelInfo } from "@/features/gallery/hooks/useModelInfo";
import {
  metadataAsJson,
  metadataEntries,
  modelBadges,
  modelFacts,
  modelStem,
} from "@/features/gallery/lib/modelInfo";
import { modelKindStyle } from "@/features/gallery/lib/modelKind";
import { useCopyFeedback } from "@/shared/hooks/useCopyFeedback";
import { iconCheck, iconCopy } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { Icon } from "@/shared/ui/Icon";
import type { GalleryItem } from "@/shared/types";

type ModelItem = Pick<GalleryItem, "path" | "name" | "modified_at" | "size" | "model_kind">;

const SKELETON_FACTS = 4;

function TriggerWord({ word }: { word: string }) {
  const { copyState, copyText } = useCopyFeedback();
  const copied = copyState === "copied";
  const failed = copyState === "error";

  return (
    <li>
      <button
        type="button"
        className={classNames(
          "model-overview__trigger",
          copied && "model-overview__trigger--copied",
          failed && "model-overview__trigger--error",
        )}
        onClick={() => void copyText(word)}
        aria-label={
          copied
            ? `Copied ${word}`
            : failed
              ? `Could not copy ${word}`
              : `Copy the trigger word ${word}`
        }
        title={failed ? "Could not copy" : "Copy"}
      >
        <span className="model-overview__trigger-text">{word}</span>
        <Icon icon={copied ? iconCheck : iconCopy} className="model-overview__trigger-icon" />
      </button>
    </li>
  );
}

/** The model at a glance on the stage: what it is, how to prompt it, and how it was trained. */
export function ModelInfoStage({ item }: { item: ModelItem }) {
  const state = useModelInfo(item);
  const info = state.status === "ready" ? state.info : null;
  const title = info?.title ?? modelStem(item.name);
  // The listing already knows the kind, so the tile is drawn before the header is read.
  const kind = modelKindStyle(info ? info.kind : item.model_kind);

  return (
    <div
      className={classNames("model-overview", `model-tone--${kind.tone}`)}
      aria-label={`Model details for ${item.name}`}
      role="group"
      aria-busy={state.status === "loading" || undefined}
    >
      <div className="model-overview__hero">
        <span className="model-overview__tile" aria-hidden="true">
          <Icon icon={kind.icon} className="model-overview__tile-icon" />
        </span>
        <div className="model-overview__heading">
          <p className="model-overview__title" title={title}>
            {title}
          </p>
          {info && (
            <ul className="model-overview__badges" aria-label="Model type">
              {modelBadges(info).map((badge) => (
                <li key={badge} className="model-overview__badge">
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {state.status === "error" && (
        <p className="model-overview__error" role="alert">
          {state.message}
        </p>
      )}

      {info && info.trigger_words.length > 0 && (
        <div className="model-overview__section">
          <span className="model-overview__label">Trigger words</span>
          <ul className="model-overview__triggers">
            {info.trigger_words.map((word) => (
              <TriggerWord key={word} word={word} />
            ))}
          </ul>
        </div>
      )}

      {state.status !== "error" && (
        <dl className="model-overview__facts">
          {info
            ? modelFacts(info).map((fact) => (
                <div key={fact.label} className="model-overview__fact">
                  <dt>{fact.label}</dt>
                  <dd title={fact.title ?? fact.value}>{fact.value}</dd>
                </div>
              ))
            : Array.from({ length: SKELETON_FACTS }, (_, index) => (
                <div key={index} className="model-overview__fact" aria-hidden="true">
                  <span className="model-overview__skeleton skeleton-shimmer" />
                  <span className="model-overview__skeleton skeleton-shimmer" />
                </div>
              ))}
        </dl>
      )}
    </div>
  );
}

/** Every `__metadata__` key, in place of the caption editor a model does not have. */
export function ModelMetadataList({ item }: { item: ModelItem }) {
  const state = useModelInfo(item);
  const { copyState, copyLabel, copyText } = useCopyFeedback();
  const metadata = state.status === "ready" ? state.info.metadata : null;
  const entries = metadata ? metadataEntries(metadata) : [];

  return (
    <div className="model-metadata">
      <div className="model-metadata__header">
        <h3 className="model-metadata__heading">
          Metadata
          {metadata && <span className="model-metadata__count">{entries.length}</span>}
        </h3>
        <button
          type="button"
          className={classNames(
            "gallery-item-dialog__caption-action",
            copyState === "copied" && "gallery-item-dialog__caption-action--copied",
            copyState === "error" && "gallery-item-dialog__caption-action--error",
          )}
          onClick={() => metadata && void copyText(metadataAsJson(metadata))}
          disabled={entries.length === 0}
          aria-label={`Copy the metadata of ${item.name} as JSON`}
        >
          <Icon icon={iconCopy} className="gallery-item-dialog__caption-action-icon" />
          {copyState === "idle" ? "Copy JSON" : copyLabel}
        </button>
      </div>
      {/* Scrolls on its own, so it takes focus for keyboard scrolling. */}
      <div
        className="model-metadata__list"
        role="region"
        aria-label={`Metadata of ${item.name}`}
        tabIndex={0}
      >
        {state.status === "loading" && <p className="model-metadata__empty">Reading...</p>}
        {state.status === "error" && (
          <p className="model-metadata__empty">No metadata could be read.</p>
        )}
        {metadata && entries.length === 0 && (
          <p className="model-metadata__empty">This file records no metadata.</p>
        )}
        {entries.length > 0 && (
          <dl className="model-metadata__entries">
            {entries.map((entry) => (
              <div key={entry.key} className="model-metadata__entry">
                <dt title={entry.key}>{entry.key}</dt>
                <dd>
                  {entry.json === null ? (
                    <span className="model-metadata__value">{entry.value}</span>
                  ) : (
                    <details className="model-metadata__json">
                      <summary>{entry.summary}</summary>
                      <pre>{entry.json}</pre>
                    </details>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
