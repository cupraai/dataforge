import { instructionApplies, type InstructionKind } from "@/shared/api/folderInstructions";
import { CAPTION_RULES_FILENAME, SYSPROMPT_FILENAME } from "@/shared/constants";
import type { FolderInstructionsState } from "@/shared/hooks/useFolderInstructions";
import {
  iconFileBraces,
  iconFileText,
  iconLoader2,
  iconTriangleAlert,
  type AppIcon,
} from "@/shared/icons";
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

/** Names the instruction file a job will read, as a line of a `.dialog-facts` box. */
export function InstructionFileSource({ state, kind }: InstructionFileSourceProps) {
  const { filename, icon } = FILES[kind];

  if (state.status === "loading") {
    return (
      <p className="dialog-facts__line" role="status">
        <Icon icon={iconLoader2} spin className="dialog-facts__icon" />
        <span className="dialog-facts__text">Loading {filename}...</span>
      </p>
    );
  }

  if (state.status === "error") return null;

  const file = state.instructions[kind];
  if (file.state.status === "missing") return null;
  if (!instructionApplies(file)) {
    return (
      <p className="dialog-facts__line dialog-facts__line--problem" role="alert">
        <Icon icon={iconTriangleAlert} className="dialog-facts__icon" />
        <span>
          {instructionFileSummary(file.state)}. {file.state.message}
        </span>
      </p>
    );
  }

  return (
    <p className="dialog-facts__line">
      <Icon icon={icon} className="dialog-facts__icon" />
      <span className="dialog-facts__text">
        Uses <strong title={file.state.source_path ?? undefined}>{file.state.relative_path}</strong>
      </span>
    </p>
  );
}
