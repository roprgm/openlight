import type { ReactNode } from "react";
import { Image } from "@/components/editor/image";
import { useScene } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { CanvasToolbar } from "@/features/layers/toolbar";
import { ComparisonDivider } from "./comparison-divider";
import { MaskOverlaySync } from "./mask-overlay";

/** The shared canvas; the active tool supplies the overlay on it and the options in the bar above it. */
export function EditorCanvas({
  tools,
  options,
}: {
  tools: ReactNode;
  options?: ReactNode;
}) {
  const size = useScene((scene) => scene.frame.size);
  return (
    <EditorViewport
      size={size}
      overlay={
        <>
          <ComparisonDivider />
          <CanvasToolbar>{options}</CanvasToolbar>
          <MaskOverlaySync />
        </>
      }
      tools={tools}
    >
      <Image original="originalImage" />
    </EditorViewport>
  );
}
