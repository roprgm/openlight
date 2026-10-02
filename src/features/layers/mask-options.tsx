import { Select } from "@roprgm/ui/select";
import { Separator } from "@roprgm/ui/separator";
import { Slider } from "@roprgm/ui/slider";
import { useDocument, useScene } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { isRangeMask, locateLayer, type MaskLayer } from "@/core/document";
import { setLayerMask, setMaskOperation } from "./edits";
import { RangeOptions } from "./range-options";

const operations = [
  { value: "add", label: "Add" },
  { value: "subtract", label: "Subtract" },
  { value: "intersect", label: "Intersect" },
] as const;

/**
 * The selected mask's options in the canvas bar: a radial feather, a range's color and numbers, and a
 * child's operation. Its overlay toggles in the stack.
 */
export function MaskOptions({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const density = useBarDensity();
  const parent = useScene(
    (scene) => locateLayer(scene.layers, layer.id)?.parent,
  );
  const { mask } = layer;
  const child = parent?.kind === "mask";
  if (mask.kind !== "radial" && !isRangeMask(mask) && !child) {
    return null;
  }
  return (
    <>
      {density !== "menu" && (
        <Separator orientation="vertical" className="my-auto h-4" />
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
      {isRangeMask(mask) && <RangeOptions id={layer.id} mask={mask} />}
      {child && (
        <Select
          raised
          variant="pill"
          aria-label="Mask operation"
          tooltip="Combine with the parent mask"
          value={layer.operation}
          items={operations}
          onValueChange={(operation) =>
            operation && setMaskOperation(document, layer.id, operation)
          }
        />
      )}
    </>
  );
}
