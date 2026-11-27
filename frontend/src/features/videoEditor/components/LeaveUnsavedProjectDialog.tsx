import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";

interface LeaveUnsavedProjectDialogProps {
  /** Why the last save failed, when the server said. */
  saveError: string | null;
  /** The draft changed elsewhere, so saving writes a new one instead. */
  conflict: boolean;
  /** Saves again, or as a new draft on a conflict; resolves whether it worked. */
  onSave: () => Promise<boolean>;
  onExit: () => void;
  onClose: () => void;
}

/** Leaving could not save: save again, stay in the editor, or leave without the changes. */
export function LeaveUnsavedProjectDialog({
  saveError,
  conflict,
  onSave,
  onExit,
  onClose,
}: LeaveUnsavedProjectDialogProps) {
  const [retrying, setRetrying] = useState(false);
  // A save that answers after the dialog closed is ignored.
  const retryIdRef = useRef(0);
  useEffect(
    () => () => {
      retryIdRef.current++;
    },
    [],
  );
  const close = () => {
    retryIdRef.current++;
    setRetrying(false);
    onClose();
  };

  return (
    <Dialog
      role="alertdialog"
      title="Your latest changes are not saved"
      description={
        <>
          {saveError ?? "The project could not be saved."} Try saving again, stay in the editor, or
          leave and lose the changes made since the last save.
        </>
      }
      onClose={close}
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => {
              close();
              onExit();
            }}
          >
            Exit
          </Button>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            busy={retrying}
            onClick={() => {
              if (retrying) return;
              const requestId = ++retryIdRef.current;
              setRetrying(true);
              void onSave().then((saved) => {
                if (requestId !== retryIdRef.current) return;
                setRetrying(false);
                if (saved) onExit();
              });
            }}
          >
            {conflict ? "Save as new" : "Retry save"}
          </Button>
        </>
      }
    />
  );
}
