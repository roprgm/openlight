import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { locateLayer, type MaskLayer } from "@/core/document";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { setLayerMask, setMaskOperation } from "./edits";
import { useMaskTool } from "./mask-tool";

/** The selected mask's options in the canvas bar: its overlay, a radial feather, and a child's operation. */
export function MaskOptions({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const tool = useMaskTool();
  const density = useBarDensity();
  const parent = useScene(
    (scene) => locateLayer(scene.layers, layer.id)?.parent,
  );
  // The button reports what the canvas shows, whether by choice or by default.
  const shown = useStore(
    document.preview,
    (preview) => preview.maskOverlay !== undefined,
  );
  const toggleOverlay = () => tool.showOverlay(!shown);
  useShortcuts({ o: toggleOverlay });
  return (
    <>
      {density !== "menu" && (
        <hr
          aria-orientation="vertical"
          className="h-4 w-px border-0 bg-white/15"
        />
      )}
      <button
        type="button"
        aria-pressed={shown}
        title="Show the mask overlay (O)"
        onClick={toggleOverlay}
        className="h-7 rounded-full px-2.5 text-neutral-400 hover:bg-white/10 hover:text-neutral-100 aria-pressed:bg-white/15 aria-pressed:text-neutral-100 pointer-coarse:h-9"
      >
        Overlay
      </button>
      {layer.mask.kind === "radial" && (
        <Slider
          label="Feather"
          value={layer.mask.feather * 100}
          min={0}
          max={100}
          defaultValue={50}
          unit="%"
          valueWidth={3}
          variant={barSlider(density)}
          onChange={(value) => {
            if (layer.mask.kind === "radial") {
              setLayerMask(document, layer.id, {
                ...layer.mask,
                feather: value / 100,
              });
            }
          }}
        />
      )}
      {parent?.kind === "mask" && (
        <Select
          variant="pill"
          aria-label="Mask operation"
          title="Combine with the parent mask"
          value={layer.operation}
          options={[
            { value: "add", label: "Add" },
            { value: "subtract", label: "Subtract" },
          ]}
          onChange={(operation) =>
            setMaskOperation(document, layer.id, operation)
          }
        />
      )}
    </>
  );
}
