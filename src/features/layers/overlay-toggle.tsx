import { IconButton } from "@roprgm/ui/icon-button";
import { useStore } from "zustand";
import { useDocument } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useMaskTool } from "./mask-tool";

/**
 * Shows or hides the selected mask's tinted overlay on the canvas, with O as its shortcut. It
 * reports what the canvas shows, whether by choice or by default, and the choice carries over to
 * the next mask selected.
 */
export function OverlayToggle() {
  const document = useDocument();
  const tool = useMaskTool();
  const shown = useStore(document.preview, (preview) =>
    Boolean(preview.maskOverlay?.layerId),
  );
  const toggle = () => tool.showOverlay(!shown);
  useShortcuts({ o: toggle });
  return (
    <IconButton
      label="Mask overlay"
      shortcut="O"
      size="icon"
      aria-pressed={shown}
      onClick={toggle}
      className="pointer-coarse:size-10 aria-pressed:bg-pressed aria-pressed:text-foreground"
    >
      {/* A frame hatched like the tint the overlay lays over the mask. */}
      <Icon className="size-4">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 11l6-6M4 17l12-12M8 19l12-12M14 19l6-6" />
      </Icon>
    </IconButton>
  );
}
