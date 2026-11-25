import {
  AUDIO_EXTENSIONS,
  GIF_EXTENSION,
  MODEL_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "@/shared/constants";
import type {
  AppSettingsResponse,
  FolderResponse,
  GalleryItem,
  Job,
  SystemPerformance,
} from "@/shared/types";

export const HOME_PATH = "C:\\Photos";
export const HOME_SYSPROMPT = "# Caption every image with rich detail.";

export const VACATION_PATH = `${HOME_PATH}\\Vacation`;

export const EMPTY_PATH = `${HOME_PATH}\\Empty`;

const MEDIA_TYPE_BY_EXTENSION: Record<string, GalleryItem["media_type"]> = {
  ...Object.fromEntries(VIDEO_EXTENSIONS.map((extension) => [extension, "video"])),
  ...Object.fromEntries(AUDIO_EXTENSIONS.map((extension) => [extension, "audio"])),
  ...Object.fromEntries(MODEL_EXTENSIONS.map((extension) => [extension, "model"])),
  [GIF_EXTENSION]: "gif",
};

export function mediaItem(
  name: string,
  folder: string,
  options: Partial<GalleryItem> = {},
): GalleryItem {
  const path = `${folder}\\${name}`;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return {
    name,
    path,
    description: null,
    has_description: false,
    has_caption_file: false,
    issue_fixes: [],
    rule_findings: [],
    has_issue_file: false,
    has_duplicate_file: false,
    has_backup: false,
    tags: [],
    has_candidate: false,
    has_watermarked_copy: false,
    caption_status: "none",
    media_type: MEDIA_TYPE_BY_EXTENSION[extension] ?? "image",
    width: 1920,
    height: 1080,
    ...options,
  };
}

export function job(options: Partial<Job> = {}): Job {
  const folder = options.folder ?? HOME_PATH;
  const status = options.status ?? "queued";
  return {
    workflow_edited: false,
    undoable: false,
    generates: false,
    id: "job-1",
    folder,
    folder_name: folder.slice(folder.lastIndexOf("\\") + 1),
    job_type: "auto_caption",
    status,
    // The server derives these two from stats; a fixture that overrides neither agrees with status.
    effective_status: status,
    warning: null,
    total: 0,
    processed: 0,
    stats: {},
    created_at: "2026-01-01T00:00:00.000Z",
    revision: 1,
    ...options,
  };
}

export const homeFolder: FolderResponse = {
  path: HOME_PATH,
  home: HOME_PATH,
  parent: null,
  breadcrumbs: [
    { name: "C:", path: "C:\\" },
    { name: "Photos", path: HOME_PATH },
  ],
  subfolders: [
    {
      name: "Vacation",
      path: VACATION_PATH,
      hidden: false,
      file_count: 1,
      captioned_count: 0,
      issue_count: 0,
    },
    {
      name: "Empty",
      path: EMPTY_PATH,
      hidden: false,
      file_count: 0,
      captioned_count: 0,
      issue_count: 0,
    },
  ],
  items: [
    mediaItem("sunset.png", HOME_PATH, {
      description: "Golden hour over the lake",
      has_description: true,
      has_caption_file: true,
      caption_status: "text",
    }),
    mediaItem("beach.jpg", HOME_PATH),
    mediaItem("waves.mp4", HOME_PATH),
  ],
  has_sysprompt: true,
  sysprompt_applies: true,
  has_caption_backup: false,
  has_caption_rules: false,
  note: "",
  item_count: 3,
  subfolder_count: 2,
  fingerprint: "fp-home",
};

export const vacationFolder: FolderResponse = {
  path: VACATION_PATH,
  home: HOME_PATH,
  parent: HOME_PATH,
  breadcrumbs: [
    { name: "C:", path: "C:\\" },
    { name: "Photos", path: HOME_PATH },
    { name: "Vacation", path: VACATION_PATH },
  ],
  subfolders: [],
  items: [
    mediaItem("lake.png", VACATION_PATH, {
      description: "Mountain lake",
      has_description: true,
      has_caption_file: true,
      caption_status: "text",
    }),
  ],
  has_sysprompt: false,
  sysprompt_applies: true,
  has_caption_backup: false,
  has_caption_rules: false,
  note: "",
  item_count: 1,
  subfolder_count: 0,
  fingerprint: "fp-vacation",
};

export const emptyFolder: FolderResponse = {
  path: EMPTY_PATH,
  home: HOME_PATH,
  parent: HOME_PATH,
  breadcrumbs: [
    { name: "C:", path: "C:\\" },
    { name: "Photos", path: HOME_PATH },
    { name: "Empty", path: EMPTY_PATH },
  ],
  subfolders: [],
  items: [],
  has_sysprompt: false,
  sysprompt_applies: true,
  has_caption_backup: false,
  has_caption_rules: false,
  note: "",
  item_count: 0,
  subfolder_count: 0,
  fingerprint: "fp-empty",
};

export function appSettings(overrides: Partial<AppSettingsResponse> = {}): AppSettingsResponse {
  const fromDefault = <T extends string | number>(value: T) => ({
    value,
    source: "default" as const,
    fallback: value,
    fallback_source: "default" as const,
  });
  const number = (value: number, minimum: number, maximum: number | null = null) => ({
    ...fromDefault(value),
    minimum,
    maximum,
  });
  return {
    vision_base_url: fromDefault("http://127.0.0.1:8888/v1"),
    vision_api_key: { is_set: false, source: "default", fallback_source: "default" },
    vision_model: fromDefault("qwen38"),
    vision_max_tokens: number(16384, 1),
    vision_top_k: number(20, 0),
    draft_caption_threshold: number(256, 1),
    thinking_temperature: number(1, 0, 2),
    thinking_top_p: number(0.95, 0.01, 1),
    thinking_min_p: number(0, 0, 1),
    thinking_presence_penalty: number(0, -2, 2),
    thinking_repeat_penalty: number(1, 0, 2),
    instruct_temperature: number(0.7, 0, 2),
    instruct_top_p: number(0.8, 0.01, 1),
    instruct_min_p: number(0, 0, 1),
    instruct_presence_penalty: number(1.5, -2, 2),
    instruct_repeat_penalty: number(1, 0, 2),
    image_max_pixels: number(1_500_000, 1),
    video_keyframes_per_second: number(2, 1),
    video_max_keyframes: number(42, 1),
    video_frame_max_pixels: number(500_000, 1),
    video_frame_min_pixels: number(262_144, 1),
    comfy_base_url: fromDefault("http://127.0.0.1:9000"),
    fill_diffusion_model: fromDefault("qwen_image_2.1_int8_convrot.safetensors"),
    fill_text_encoder: fromDefault("qwen3vl_8b_int8_convrot.safetensors"),
    fill_vae: fromDefault("qwen_image_2.1_vae_bf16.safetensors"),
    fill_turbo_lora: fromDefault("qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors"),
    fill_quality_steps: number(30, 1, 100),
    fill_quality_cfg: number(3, 1, 10),
    ai_toolkit_base_url: fromDefault("http://127.0.0.1:8675"),
    thumbnail_cache_max_mb: number(2048, 0),
    job_history_days: number(30, 0),
    notification_history_days: number(3, 0),
    tag_min_confidence: number(0.25, 0.1, 1),
    ...overrides,
  };
}

export function systemPerformance(overrides: Partial<SystemPerformance> = {}): SystemPerformance {
  return {
    os_name: "Windows 11 (10.0.26200)",
    architecture: "AMD64",
    uptime_seconds: 3 * 86_400 + 4 * 3600,
    cpu_name: "Intel Core i7-12700K",
    cpu_cores: 12,
    cpu_threads: 4,
    cpu_clock_mhz: 3600,
    cpu_clock_is_live: false,
    cpu_load_percent: 20,
    cpu_core_load_percents: [10, 20, 30, 95],
    cpu_temperature_celsius: 54,
    cpu_power_watts: 95,
    memory_total_bytes: 32 * 1024 ** 3,
    memory_used_bytes: 8 * 1024 ** 3,
    swap_total_bytes: 8 * 1024 ** 3,
    swap_used_bytes: 1024 ** 3,
    gpu_available: true,
    gpu_name: "NVIDIA GeForce RTX 3080",
    gpu_driver: "580.12",
    gpu_memory_bytes: 10 * 1024 ** 3,
    gpu_memory_used_bytes: 4 * 1024 ** 3,
    gpu_load_percent: 40,
    gpu_temperature_celsius: 62,
    gpu_power_watts: 280,
    gpu_power_limit_watts: 320,
    gpu_clock_mhz: 1800,
    gpu_max_clock_mhz: 2100,
    gpu_memory_clock_mhz: 9500,
    gpu_pcie_generation: 4,
    gpu_pcie_width: 16,
    gpu_processes: [
      { pid: 10, name: "python", service: "ComfyUI", used_bytes: 3 * 1024 ** 3 },
      { pid: 20, name: "llama-server", service: null, used_bytes: 1024 ** 3 },
    ],
    disks: [
      {
        name: "C:",
        mountpoint: "C:\\",
        filesystem: "NTFS",
        total_bytes: 1000 * 1024 ** 3,
        used_bytes: 600 * 1024 ** 3,
      },
    ],
    disk_read_bytes_per_second: 2048,
    disk_write_bytes_per_second: 0,
    network_received_bytes_per_second: 512,
    network_sent_bytes_per_second: 1024 ** 2,
    process_cpu_percent: 1.5,
    process_memory_bytes: 300 * 1024 ** 2,
    process_threads: 9,
    process_uptime_seconds: 720,
    ...overrides,
  };
}
