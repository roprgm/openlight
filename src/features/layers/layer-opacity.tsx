import { ScrubInput } from "@roprgm/ui/scrub-input";
import { useDocument } from "@/components/editor/session";
import type { ProcessingLayer } from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { setLayer } from "./edits";

/** The row's opacity, which drags sideways as one edit and types on click. */
export function LayerOpacity({ layer }: { layer: ProcessingLayer }) {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  return (
    <span {...gesture} className="flex">
      <ScrubInput
        aria-label={`${layer.name} opacity`}
        value={layer.opacity * 100}
        min={0}
        max={100}
        defaultValue={100}
        format={(value) => `${value}%`}
        minChars={3}
        onChange={(value) =>
          setLayer(document, layer.id, { opacity: value / 100 })
        }
      />
    </span>
  );
}
