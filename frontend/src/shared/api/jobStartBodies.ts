import type {
  AutoAdjustStartRequest,
  AutoCaptionStartRequest,
  BackupCaptionsStartRequest,
  BatchRenameStartRequest,
  CheckCaptionRulesStartRequest,
  ComfyRunStartRequest,
  ComfyShowcaseStartRequest,
  FindDuplicatesStartRequest,
  JobType,
  ReplaceCaptionsStartRequest,
  ResizeStartRequest,
  RestoreCaptionsStartRequest,
  SetCaptionsStartRequest,
  SplitVideoStartRequest,
  StripMetadataStartRequest,
  TrainLoraStartRequest,
  TrimVideoStartRequest,
  EditCaptionsStartRequest,
  VerifyCaptionsStartRequest,
  WatermarkStartRequest,
} from "@/shared/types";

/** Derived from generated request types so a renamed body model fails at compile time. */
export interface JobStartBodies {
  auto_caption: AutoCaptionStartRequest;
  set_captions: SetCaptionsStartRequest;
  replace_captions: ReplaceCaptionsStartRequest;
  find_duplicates: FindDuplicatesStartRequest;
  verify_captions: VerifyCaptionsStartRequest;
  check_caption_rules: CheckCaptionRulesStartRequest;
  edit_captions: EditCaptionsStartRequest;
  batch_rename: BatchRenameStartRequest;
  train_lora: TrainLoraStartRequest;
  watermark: WatermarkStartRequest;
  comfy_run: ComfyRunStartRequest;
  comfy_showcase: ComfyShowcaseStartRequest;
  strip_metadata: StripMetadataStartRequest;
  backup_captions: BackupCaptionsStartRequest;
  restore_captions: RestoreCaptionsStartRequest;
  auto_adjust: AutoAdjustStartRequest;
  resize: ResizeStartRequest;
  split_video: SplitVideoStartRequest;
  trim_video: TrimVideoStartRequest;
}

/** Any job's body, for callers whose job type is only known at runtime. */
export type JobStartBody = JobStartBodies[JobType];
