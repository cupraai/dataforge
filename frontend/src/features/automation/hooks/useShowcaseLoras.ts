import { useQuery } from "@tanstack/react-query";
import {
  comfyLorasQueryOptions,
  trainingRunsQueryOptions,
} from "@/features/automation/api/showcase";
import { savesOfRun } from "@/features/automation/lib/showcase";
import { foldersMatch, isInsideFolder } from "@/features/folder/lib/folderPath";
import { formatApiError } from "@/shared/api/http";
import type { ComfyLora } from "@/shared/types";
import type { SearchSelectOption } from "@/shared/ui/SearchSelect";

/** How many of the newest training runs the LoRA picker offers to compare. */
const RUN_SHORTCUTS = 4;

/** The subfolder ComfyUI lists a LoRA under, such as an architecture's. */
function loraFolder(name: string): string | undefined {
  const cut = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return cut > 0 ? name.slice(0, cut) : undefined;
}

export interface TrainedRun {
  name: string;
  /** Its saves that ComfyUI lists, in training order. */
  saves: string[];
}

export interface ShowcaseLoras {
  options: SearchSelectOption[];
  loading: boolean;
  /** Why none are listed. */
  note: string | null;
  refresh: () => void;
  /** The newest training runs with saves to compare. */
  runs: TrainedRun[];
}

/** The LoRAs ComfyUI lists, and which of them recent training runs saved. */
export function useShowcaseLoras(): ShowcaseLoras {
  const query = useQuery(comfyLorasQueryOptions());
  const trained = useQuery(trainingRunsQueryOptions());
  const loras: readonly ComfyLora[] = query.data?.loras ?? [];

  let note = query.data?.error ?? null;
  if (query.isError) note = formatApiError(query.error);
  else if (query.data && !query.data.available) {
    note = "ComfyUI is not answering, so its LoRAs cannot be listed.";
  }

  const names = new Set((trained.data?.jobs ?? []).map((job) => job.external_ref));
  return {
    options: loras.map((lora) => ({
      value: lora.name,
      label: lora.stem,
      detail: loraFolder(lora.name),
    })),
    loading: query.isPending,
    note,
    refresh: () => void query.refetch(),
    runs: [...names]
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ name, saves: savesOfRun(loras, name) }))
      .filter((run) => run.saves.length > 0)
      .slice(0, RUN_SHORTCUTS),
  };
}

/** The newest training run whose dataset this folder is, or lies inside. */
export function useTrainedHere(folderPath: string): string | null {
  const { data } = useQuery(trainingRunsQueryOptions());
  const run = data?.jobs.find(
    (job) => foldersMatch(job.folder, folderPath) || isInsideFolder(folderPath, job.folder),
  );
  return run ? (run.external_ref ?? run.folder_name) : null;
}
