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
import { Slider } from "@/components/ui/slider";
import { findLayer, type ProcessingLayer } from "@/core/document";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { setLayer } from "./edits";
import { MaskOptions } from "./mask-options";

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
