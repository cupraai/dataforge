import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { comfyPresetMapQueryOptions } from "@/features/automation/lib/automationQueries";
import { ComfyWorkflowMap } from "@/features/gallery/components/ComfyWorkflowMap";
import { branchPassInfo } from "@/features/gallery/lib/comfyWorkflow";
import { formatApiError } from "@/shared/api/http";
import type { ComfyOutputBranch } from "@/shared/types";

/** The selected preset drawn as a workflow map: what it loads, how it samples, what it saves. */
export function ComfyPresetMap({ preset }: { preset: string }) {
  const query = useQuery({ ...comfyPresetMapQueryOptions(preset), enabled: preset !== "" });

  if (!preset) return null;

  if (query.isPending) {
    // Not a status role: the dialog's preset loading is the one status a test or reader awaits.
    return <div className="comfy-preset-map__skeleton" aria-busy="true" aria-label="Loading map" />;
  }

  if (query.isError) {
    return (
      <p className="comfy-preset-map__message">
        Could not read this workflow. {formatApiError(query.error)}
      </p>
    );
  }

  const { branch, error } = query.data;
  if (error || !branch) {
    return (
      <p className="comfy-preset-map__message comfy-preset-map__message--problem">
        {error ?? "This workflow has no output to draw."}
      </p>
    );
  }

  return <PresetBranchMap branch={branch} />;
}

/** One output drawn as a map; also draws a file's own workflow, which has no preset to fetch. */
export function PresetBranchMap({ branch }: { branch: ComfyOutputBranch }) {
  const { passNumbers, passSettings } = useMemo(() => branchPassInfo(branch), [branch]);
  const loadsNothing = branch.map.every((node) => node.kind === "output");

  return (
    <>
      <ComfyWorkflowMap
        map={branch.map}
        passNumbers={passNumbers}
        passSettings={passSettings}
        output={branch.label}
        heading={null}
      />
      {loadsNothing && (
        <p className="comfy-preset-map__message">
          This workflow loads no models, LoRAs or files, so its map is just the output.
        </p>
      )}
    </>
  );
}
