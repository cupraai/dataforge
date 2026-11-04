import { instructionApplies, type InstructionKind } from "@/shared/api/folderInstructions";
import { CAPTION_RULES_FILENAME, SYSPROMPT_FILENAME } from "@/shared/constants";
import type { FolderInstructionsState } from "@/shared/hooks/useFolderInstructions";
import { iconFileBraces, iconFileText, iconLoader2, type AppIcon } from "@/shared/icons";
import { Icon } from "@/shared/ui/Icon";
import { instructionFileSummary } from "@/shared/lib/instructionFileState";

const FILES: Record<InstructionKind, { filename: string; icon: AppIcon }> = {
  sysprompt: { filename: SYSPROMPT_FILENAME, icon: iconFileText },
  caption_rules: { filename: CAPTION_RULES_FILENAME, icon: iconFileBraces },
};

interface InstructionFileSourceProps {
  state: FolderInstructionsState;
  kind: InstructionKind;
}

/** Names the instruction file a job will read, for a dialog footer. */
export function InstructionFileSource({ state, kind }: InstructionFileSourceProps) {
  const { filename, icon } = FILES[kind];

  if (state.status === "loading") {
    return (
      <p className="instruction-file-source" role="status">
        <Icon icon={iconLoader2} spin className="instruction-file-source__icon" />
        <span className="instruction-file-source__text">Loading {filename}...</span>
      </p>
    );
  }

  if (state.status === "error") return null;

  const file = state.instructions[kind];
  if (file.state.status === "missing") return null;
  if (!instructionApplies(file)) {
    return (
      <p className="instruction-file-source dialog__error" role="alert">
        {instructionFileSummary(file.state)}. {file.state.message}
      </p>
    );
  }

  return (
    <p className="instruction-file-source">
      <Icon icon={icon} className="instruction-file-source__icon" />
      <span className="instruction-file-source__text">
        Uses <strong title={file.state.source_path ?? undefined}>{file.state.relative_path}</strong>
      </span>
    </p>
  );
}
