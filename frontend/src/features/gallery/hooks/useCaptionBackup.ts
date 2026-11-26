import { useQuery } from "@tanstack/react-query";
import { fetchCaptionBackup } from "@/features/gallery/api/captions";

export interface CaptionBackup {
  /** The backed-up caption, or `null` when the folder has no backup of the file. */
  backup: string | null;
  /** The first answer for this file is still on its way; `backup` is `null` meanwhile. */
  pending: boolean;
}

export function useCaptionBackup(itemPath: string | undefined, enabled: boolean): CaptionBackup {
  const ready = Boolean(itemPath) && enabled;

  const { data, isPending } = useQuery({
    queryKey: ["caption-backup", itemPath],
    queryFn: async () => {
      const response = await fetchCaptionBackup(itemPath!);
      return response.exists ? (response.description ?? "") : null;
    },
    enabled: ready,
    // A folder whose backup disappeared simply offers nothing to restore.
    retry: false,
  });

  return ready ? { backup: data ?? null, pending: isPending } : { backup: null, pending: false };
}
