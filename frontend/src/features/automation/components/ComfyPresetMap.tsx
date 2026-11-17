import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { comfyWorkflowMapQueryOptions } from "@/features/automation/lib/automationQueries";
import { ComfyWorkflowMap } from "@/features/gallery/components/ComfyWorkflowMap";
import { branchPassInfo } from "@/features/gallery/lib/comfyWorkflow";
import { formatApiError } from "@/shared/api/http";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import type { ComfyOutputBranch, ComfyWorkflowMapRequest } from "@/shared/types";

/** Long enough that typing into a text input asks once, short enough that a switch feels live. */
const MAP_INPUT_DELAY_MS = 250;

function sameWorkflow(a: ComfyWorkflowMapRequest, b: ComfyWorkflowMapRequest): boolean {
  return (
    a.preset === b.preset &&
    a.source?.path === b.source?.path &&
    a.source?.node_id === b.source?.node_id
  );
}

/**
 * The selected workflow drawn as a map, as it would run with the dialog's inputs: a switch
 * input shows the branch it picks. ``saved`` is the map already in hand for the workflow as
 * saved, drawn instead of asking while no input is changed.
 */
export function ComfyPresetMap({
  request,
  saved,
}: {
  request: ComfyWorkflowMapRequest;
  saved?: ComfyOutputBranch;
}) {
  // Debounced as text: the request is rebuilt each render, and an object would never settle.
  const settledText = useDebouncedValue(JSON.stringify(request), MAP_INPUT_DELAY_MS);
  const settled = JSON.parse(settledText) as ComfyWorkflowMapRequest;
  // Another workflow is drawn at once, as saved; only its inputs wait for typing to stop.
  const current = sameWorkflow(settled, request) ? settled : { ...request, inputs: {} };
  const unchanged = Object.keys(current.inputs ?? {}).length === 0;
  const named = Boolean(current.preset) || Boolean(current.source);
  const query = useQuery({
    ...comfyWorkflowMapQueryOptions(current),
    enabled: named && !(saved && unchanged),
    // Keep drawing the last map while a toggled input is read, rather than flash the skeleton.
    placeholderData: (previous, previousQuery) => {
      const asked = previousQuery?.queryKey[1] as ComfyWorkflowMapRequest | undefined;
      return asked && sameWorkflow(asked, current) ? previous : undefined;
    },
  });

  if (!named) return null;
  if (saved && (unchanged || query.isPending)) return <PresetBranchMap branch={saved} />;

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
function PresetBranchMap({ branch }: { branch: ComfyOutputBranch }) {
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
