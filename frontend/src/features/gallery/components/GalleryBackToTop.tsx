import { IconButton } from "@/shared/ui/IconButton";
import { iconArrowUp } from "@/shared/icons";
import { classNames } from "@/shared/lib/classNames";

interface GalleryBackToTopProps {
  visible: boolean;
  onClick: () => void;
}

export function GalleryBackToTop({ visible, onClick }: GalleryBackToTopProps) {
  return (
    <div className="gallery-back-to-top-anchor">
      <IconButton
        icon={iconArrowUp}
        label="Back to top"
        tooltip={false}
        size="lg"
        shape="round"
        className={classNames("gallery-back-to-top", visible && "gallery-back-to-top--visible")}
        onClick={onClick}
        tabIndex={visible ? 0 : -1}
      />
    </div>
  );
}
