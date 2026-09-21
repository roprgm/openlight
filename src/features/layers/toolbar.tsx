import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useDocument, useScene } from "@/components/editor/session";
import {
  barSlider,
  Density,
  useBarDensity,
} from "@/components/editor/toolbar-density";
import { Icon } from "@/components/icons/icon";
import { Menu } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  findLayer,
  locateLayer,
  type MaskLayer,
  type ProcessingLayer,
} from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { setLayer, setLayerMask, setMaskOperation } from "./edits";
import { useMaskTool } from "./mask-tool";

function MaskOptions({ layer }: { layer: MaskLayer }) {
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

function LayerOptions({ layer }: { layer: ProcessingLayer }) {
  const document = useDocument();
  const density = useBarDensity();
  return (
    <>
      <Slider
        label="Opacity"
        value={layer.opacity * 100}
        min={0}
        max={100}
        defaultValue={100}
        unit="%"
        valueWidth={3}
        variant={barSlider(density)}
        onChange={(value) =>
          setLayer(document, layer.id, { opacity: value / 100 })
        }
      />
      {layer.kind === "mask" && <MaskOptions layer={layer} />}
    </>
  );
}

/** Steps of compression: bars, fields only, layer options in the menu, everything in the menu. */
const steps = 4;

/**
 * The bar over the canvas edits the active tool and the selected layer; creating layers happens in
 * the stack. It never wraps: when the content overflows, it compresses one step at a time until it fits.
 */
export function CanvasToolbar({ children }: { children?: ReactNode }) {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  const selected = useStore(document.selection, (state) => state.layerId);
  const layer = useScene(
    (scene) => findLayer(scene.layers, selected) ?? scene.layers[0],
  );
  const bar = useRef<HTMLFieldSetElement>(null);
  const [step, setStep] = useState(0);
  const hasLayerOptions = layer.kind !== "image" && layer.kind !== "heal";
  const shown = Boolean(children) || hasLayerOptions;
  const content = `${Boolean(children)}/${layer.kind}/${layer.kind === "mask" ? layer.mask.kind : ""}`;
  // New content or a resized canvas starts again from the roomiest layout.
  useLayoutEffect(() => setStep(0), [content]);
  useLayoutEffect(() => {
    const canvas = bar.current?.parentElement;
    if (!shown || !canvas) {
      return;
    }
    const observer = new ResizeObserver(() => setStep(0));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [shown]);
  useLayoutEffect(() => {
    const element = bar.current;
    if (
      element &&
      element.scrollWidth > element.clientWidth &&
      step < steps - 1
    ) {
      setStep(step + 1);
    }
  });
  if (!shown) {
    return null;
  }
  const inlineTool = step < 3 ? children : null;
  const inlineLayer = step < 2 && hasLayerOptions;
  const menuTool = step >= 3 ? children : null;
  const menuLayer = step >= 2 && hasLayerOptions;
  return (
    <fieldset
      ref={bar}
      aria-label="Layer options"
      {...gesture}
      className="absolute top-3 left-3 flex min-w-0 max-w-[calc(100%-1.5rem)] items-center gap-x-2.5 overflow-hidden rounded-full bg-neutral-800/80 p-1 pr-2 backdrop-blur-sm"
    >
      <Density value={step === 0 ? "full" : "compact"}>
        {inlineTool}
        {inlineLayer && <LayerOptions layer={layer} />}
      </Density>
      {(menuTool || menuLayer) && (
        <Menu
          variant="pill"
          label="More options"
          icon={
            <Icon className="size-4">
              <path
                d="M12 5h.01M12 12h.01M12 19h.01"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </Icon>
          }
        >
          <Density value="menu">
            <div className="flex w-56 flex-col gap-3 p-2">
              {menuTool}
              {menuLayer && <LayerOptions layer={layer} />}
            </div>
          </Density>
        </Menu>
      )}
    </fieldset>
  );
}
