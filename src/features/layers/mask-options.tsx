import { Select } from "@roprgm/ui/select";
import { Slider } from "@roprgm/ui/slider";
import { useDocument, useScene } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { locateLayer, type MaskLayer } from "@/core/document";
import { setLayerMask, setMaskOperation } from "./edits";

/** The selected mask's options in the canvas bar: a radial feather and a child's operation. Its overlay toggles in the stack. */
export function MaskOptions({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const density = useBarDensity();
  const parent = useScene(
    (scene) => locateLayer(scene.layers, layer.id)?.parent,
  );
  const radial = layer.mask.kind === "radial";
  const child = parent?.kind === "mask";
  if (!radial && !child) {
    return null;
  }
  return (
    <>
      {density !== "menu" && (
        <hr
          aria-orientation="vertical"
          className="h-4 w-px border-0 bg-white/15"
        />
      )}
      {layer.mask.kind === "radial" && (
        <Slider
          label="Feather"
          value={layer.mask.feather * 100}
          min={0}
          max={100}
          defaultValue={50}
          format={(value) => `${value}%`}
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
      {child && (
        <Select
          variant="pill"
          aria-label="Mask operation"
          tooltip="Combine with the parent mask"
          value={layer.operation}
          items={[
            { value: "add", label: "Add" },
            { value: "subtract", label: "Subtract" },
          ]}
          onValueChange={(operation) =>
            operation && setMaskOperation(document, layer.id, operation)
          }
        />
      )}
    </>
  );
}
