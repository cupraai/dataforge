import { Button } from "@/shared/ui/Button";
import { FieldGroup, TextInput } from "@/shared/ui/Field";
import { Checkbox } from "@/shared/ui/Checkbox";
import { GuardedDialog } from "@/shared/ui/GuardedDialog";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadWatermarkImage, WATERMARK_IMAGE_URL } from "@/features/automation/api/jobs";
import { watermarkImageQueryOptions } from "@/features/automation/lib/automationQueries";
import type { JobSettingsByType } from "@/features/automation/preferences/automationPreferences";
import { formatApiError } from "@/shared/api/http";
import { iconImage } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";
import { RadioTileGroup, type RadioTileOption } from "@/shared/ui/RadioTileGroup";
import { DialogActions } from "@/shared/ui/Dialog";
import type { DialogScopeInfo } from "@/shared/ui/DialogScope";
import { Icon } from "@/shared/ui/Icon";
import type { WatermarkOpacity, WatermarkPosition, WatermarkSizeName } from "@/shared/types";

export const MAX_WATERMARK_TEXT_LENGTH = 120;

const SIZES: ReadonlyArray<RadioTileOption<WatermarkSizeName>> = [
  { value: "small", title: "Small" },
  { value: "medium", title: "Medium" },
  { value: "large", title: "Large" },
];

const OPACITIES: ReadonlyArray<RadioTileOption<`${WatermarkOpacity}`>> = [
  { value: "25", title: "25%" },
  { value: "50", title: "50%" },
  { value: "75", title: "75%" },
  { value: "100", title: "100%" },
];

const POSITIONS: ReadonlyArray<{ value: WatermarkPosition; title: string }> = [
  { value: "top_left", title: "Top left" },
  { value: "top_right", title: "Top right" },
  { value: "center", title: "Center" },
  { value: "bottom_left", title: "Bottom left" },
  { value: "bottom_right", title: "Bottom right" },
];

type WatermarkSettings = JobSettingsByType["watermark"];
type Mark = "text" | "image";

interface WatermarkDialogProps {
  scope: DialogScopeInfo;
  initialSettings: WatermarkSettings;
  busy?: boolean;
  /** Replaces the start label, as when the dialog edits a workflow step instead. */
  confirmLabel?: string;
  onConfirm: (settings: WatermarkSettings) => void;
  onCancel: () => void;
}

/** Five spots on a frame: tiles for them would not fit the column. */
function PositionPicker({
  value,
  disabled,
  onChange,
}: {
  value: WatermarkPosition;
  disabled: boolean;
  onChange: (value: WatermarkPosition) => void;
}) {
  const name = useId();
  const current = POSITIONS.find((option) => option.value === value);
  return (
    <FieldGroup label="Position" role="radiogroup">
      <div className="watermark-dialog__position">
        <div className="watermark-dialog__frame">
          {POSITIONS.map((option) => (
            <label
              key={option.value}
              className="watermark-dialog__spot"
              data-position={option.value}
              title={option.title}
            >
              <input
                type="radio"
                name={name}
                className="dialog__radio-input"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                aria-label={option.title}
              />
              <span className="dialog__radio" aria-hidden="true" />
            </label>
          ))}
        </div>
        <span
          className={classNames(
            "watermark-dialog__position-name",
            disabled && "watermark-dialog__position-name--disabled",
          )}
          aria-hidden="true"
        >
          {current?.title}
        </span>
      </div>
    </FieldGroup>
  );
}

/** Size, opacity and position: the same three controls for both marks, so they cannot drift. */
function MarkOptions({
  size,
  opacity,
  position,
  disabled,
  onChange,
}: {
  size: WatermarkSizeName;
  opacity: WatermarkOpacity;
  position: WatermarkPosition;
  disabled: boolean;
  onChange: (patch: {
    size?: WatermarkSizeName;
    opacity?: WatermarkOpacity;
    position?: WatermarkPosition;
  }) => void;
}) {
  return (
    <>
      <RadioTileGroup
        value={size}
        options={SIZES}
        label="Size"
        disabled={disabled}
        onChange={(value) => onChange({ size: value })}
      />
      <RadioTileGroup
        value={`${opacity}` as const}
        options={OPACITIES}
        label="Opacity"
        disabled={disabled}
        onChange={(value) => onChange({ opacity: Number(value) as WatermarkOpacity })}
      />
      <PositionPicker
        value={position}
        disabled={disabled}
        onChange={(value) => onChange({ position: value })}
      />
    </>
  );
}

/** The toggle stands in for the first label and the error for its hint, so 720px never scrolls. */
function MarkColumn({
  title,
  enabled,
  toggleDisabled,
  onToggle,
  control,
  hint,
  error,
  errorId,
  children,
}: {
  title: string;
  enabled: boolean;
  toggleDisabled: boolean;
  onToggle: (enabled: boolean) => void;
  control: ReactNode;
  hint: string;
  error: string | null;
  errorId: string;
  children: ReactNode;
}) {
  return (
    <section className="watermark-dialog__column" aria-label={`${title} watermark`}>
      <div className="field">
        <Checkbox
          className="watermark-dialog__toggle"
          label={title}
          checked={enabled}
          disabled={toggleDisabled}
          onChange={onToggle}
        />
        {control}
        {error ? (
          <p id={errorId} className="field__hint watermark-dialog__error" role="alert">
            {error}
          </p>
        ) : (
          <p className="field__hint watermark-dialog__hint">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function sameSettings(a: WatermarkSettings, b: WatermarkSettings): boolean {
  return (Object.keys(a) as (keyof WatermarkSettings)[]).every((key) => a[key] === b[key]);
}

export function WatermarkDialog({
  scope,
  initialSettings,
  busy = false,
  confirmLabel,
  onConfirm,
  onCancel,
}: WatermarkDialogProps) {
  const queryClient = useQueryClient();
  const { data: storedImage } = useQuery(watermarkImageQueryOptions());

  const [draft, setDraft] = useState<WatermarkSettings>(initialSettings);
  // Uploaded on confirm, not on pick, so cancelling leaves the stored PNG alone.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{ mark: Mark; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);

  const update = (patch: Partial<WatermarkSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const working = busy || uploading;
  const hasImage = picked !== null || storedImage?.available === true;
  const previewUrl =
    picked?.url ??
    (storedImage?.available ? `${WATERMARK_IMAGE_URL}?v=${storedImage.revision}` : null);
  let imageHint = "A logo or signature with a transparent background works best.";
  if (picked) imageHint = picked.file.name;
  else if (storedImage?.available) {
    imageHint = `Saved PNG, ${storedImage.width} × ${storedImage.height} px.`;
  }

  const handlePick = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") {
      setError({ mark: "image", message: "Choose a PNG file." });
      return;
    }
    setError(null);
    setPicked({ file, url: URL.createObjectURL(file) });
  };

  const handleConfirm = useCallback(async () => {
    if (working) return;

    const text = draft.text.trim();
    if (!draft.text_enabled && !draft.image_enabled) {
      setError({ mark: "text", message: "Turn on the text or the image watermark." });
      return;
    }
    if (draft.text_enabled && !text) {
      setError({ mark: "text", message: "Enter the watermark text." });
      return;
    }
    if (draft.text_enabled && text.length > MAX_WATERMARK_TEXT_LENGTH) {
      setError({
        mark: "text",
        message: `Watermark text cannot be longer than ${MAX_WATERMARK_TEXT_LENGTH} characters.`,
      });
      return;
    }
    if (draft.image_enabled && !hasImage) {
      setError({ mark: "image", message: "Choose a PNG for the watermark." });
      return;
    }

    setError(null);
    if (draft.image_enabled && picked) {
      setUploading(true);
      try {
        const info = await uploadWatermarkImage(picked.file);
        queryClient.setQueryData(watermarkImageQueryOptions().queryKey, info);
      } catch (uploadError) {
        setError({ mark: "image", message: formatApiError(uploadError) });
        return;
      } finally {
        setUploading(false);
      }
    }

    onConfirm({ ...draft, text });
  }, [draft, hasImage, onConfirm, picked, queryClient, working]);

  const textDisabled = working || !draft.text_enabled;
  const imageDisabled = working || !draft.image_enabled;

  return (
    <GuardedDialog
      unsavedChanges={picked !== null || !sameSettings(draft, initialSettings)}
      scope={scope}
      title="Add watermark?"
      description={
        <>
          Originals stay untouched — marked copies go to the <strong>watermarked</strong> subfolder,
          without caption sidecars.
        </>
      }
      panelClassName="watermark-dialog"
      busy={working}
      onConfirm={() => void handleConfirm()}
      onClose={onCancel}
      describedById={error ? errorId : undefined}
      footer={
        <DialogActions
          confirmLabel={confirmLabel ?? "Add watermark"}
          busyLabel={uploading ? "Uploading..." : "Starting..."}
          onCancel={onCancel}
        />
      }
    >
      <div className="watermark-dialog__columns">
        <MarkColumn
          title="Text"
          enabled={draft.text_enabled}
          toggleDisabled={working}
          onToggle={(enabled) => update({ text_enabled: enabled })}
          hint="White with a dark outline, on every frame of a video."
          error={error?.mark === "text" ? error.message : null}
          errorId={errorId}
          control={
            <TextInput
              aria-label="Watermark text"
              value={draft.text}
              onChange={(event) => update({ text: event.target.value })}
              placeholder="e.g. (c) Sample Studio"
              maxLength={MAX_WATERMARK_TEXT_LENGTH}
              spellCheck={false}
              autoComplete="off"
              disabled={textDisabled}
            />
          }
        >
          <MarkOptions
            size={draft.size}
            opacity={draft.opacity}
            position={draft.position}
            disabled={textDisabled}
            onChange={update}
          />
        </MarkColumn>

        <MarkColumn
          title="Image"
          enabled={draft.image_enabled}
          toggleDisabled={working}
          onToggle={(enabled) => update({ image_enabled: enabled })}
          hint={imageHint}
          error={error?.mark === "image" ? error.message : null}
          errorId={errorId}
          control={
            <div className="watermark-dialog__image">
              <div
                className={classNames(
                  "watermark-dialog__thumb",
                  imageDisabled && "watermark-dialog__thumb--disabled",
                )}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="PNG watermark preview"
                    // Shows the chosen opacity on the mark itself.
                    style={{ opacity: draft.image_opacity / 100 }}
                  />
                ) : (
                  <Icon icon={iconImage} className="watermark-dialog__thumb-icon" />
                )}
              </div>
              <Button disabled={imageDisabled} onClick={() => fileInputRef.current?.click()}>
                {hasImage ? "Replace PNG..." : "Choose PNG..."}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                aria-label="PNG watermark file"
                hidden
                disabled={imageDisabled}
                onChange={(event) => {
                  handlePick(event.target.files?.[0]);
                  // Cleared so choosing the same file again still fires a change.
                  event.target.value = "";
                }}
              />
            </div>
          }
        >
          <MarkOptions
            size={draft.image_size}
            opacity={draft.image_opacity}
            position={draft.image_position}
            disabled={imageDisabled}
            onChange={({ size, opacity, position }) =>
              update({
                ...(size && { image_size: size }),
                ...(opacity && { image_opacity: opacity }),
                ...(position && { image_position: position }),
              })
            }
          />
        </MarkColumn>
      </div>

      <Checkbox
        label="Strip metadata (EXIF, XMP, video tags) from the copies"
        checked={draft.strip_metadata}
        disabled={working}
        onChange={(checked) => update({ strip_metadata: checked })}
      />
    </GuardedDialog>
  );
}
