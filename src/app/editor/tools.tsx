import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from "react";
import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument } from "@/components/editor/session";
import { AdjustIcon } from "@/components/icons/adjust";
import { BrushIcon } from "@/components/icons/brush";
import { CropIcon } from "@/components/icons/crop";
import { ExportIcon } from "@/components/icons/export";
import { EyedropperIcon } from "@/components/icons/eyedropper";
import { HealIcon } from "@/components/icons/heal";
import { LinearGradientIcon } from "@/components/icons/linear-gradient";
import { RadialGradientIcon } from "@/components/icons/radial-gradient";
import { findLayer } from "@/core/document";
import { CropEditor } from "@/features/crop/view";
import { HealOptions } from "@/features/heal/options";
import { HealOverlay } from "@/features/heal/overlay";
import { addLayer } from "@/features/layers/edits";
import { GradientOverlay } from "@/features/layers/gradient-overlay";
import { RangePicker } from "@/features/layers/range-picker";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { BrushToolCanvas, BrushToolOptions } from "./brush";
import { ExportMode } from "./export";
import { createLayer } from "./layers";

const ToolContext = createContext<{
  tool: Tool;
  setTool: Dispatch<SetStateAction<Tool>>;
} | null>(null);

export function useTool() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("A tool provider is required.");
  }
  return context;
}

function LinearCanvas() {
  return <GradientOverlay shape="linear" />;
}

function RadialCanvas() {
  return <GradientOverlay shape="radial" />;
}

function HealCanvas() {
  const document = useDocument();
  const { setTool } = useTool();
  return (
    <HealOverlay
      onCreate={() => addLayer(document, createLayer("heal"))}
      onDone={() => setTool(adjust)}
    />
  );
}

/** No mask canvas: the selected layer is active for its sliders, but not being edited on the image. */
const adjust = {
  id: "adjust",
  label: "Adjust",
  shortLabel: "Adjust",
  key: "a",
  Icon: AdjustIcon,
  group: "edit",
} as const;

export const exportTool = {
  id: "export",
  label: "Export",
  shortLabel: "Export",
  key: "e",
  Icon: ExportIcon,
  group: "output",
  View: ExportMode,
} as const;

/**
 * Tools edit masks over the shared canvas: a shape tool brings its Canvas overlay and optional Options for
 * the bar above the image, while the sidebar always shows the selected layer's controls. Adjust has no
 * canvas, so a selected mask is active without being edited. A View replaces both. The output tool opens
 * from the header rather than the rail.
 */
export const tools = [
  adjust,
  {
    id: "brush",
    label: "Brush",
    shortLabel: "Brush",
    key: "b",
    Icon: BrushIcon,
    group: "edit",
    Canvas: BrushToolCanvas,
    Options: BrushToolOptions,
  },
  {
    id: "linear",
    label: "Linear gradient",
    shortLabel: "Linear",
    key: "l",
    Icon: LinearGradientIcon,
    group: "edit",
    Canvas: LinearCanvas,
  },
  {
    id: "radial",
    label: "Radial gradient",
    shortLabel: "Radial",
    key: "r",
    Icon: RadialGradientIcon,
    group: "edit",
    Canvas: RadialCanvas,
  },
  {
    id: "heal",
    label: "Healing",
    shortLabel: "Heal",
    key: "h",
    Icon: HealIcon,
    group: "edit",
    Canvas: HealCanvas,
    Options: HealOptions,
  },
  {
    id: "crop",
    label: "Crop",
    shortLabel: "Crop",
    key: "c",
    Icon: CropIcon,
    group: "edit",
    View: CropEditor,
  },
  {
    id: "color-range",
    label: "Color range",
    shortLabel: "Color",
    key: "k",
    Icon: EyedropperIcon,
    // Color ranges pick from the canvas, but their masks come from the layer menus, not the rail.
    group: "mask",
    Canvas: RangePicker,
  },
  exportTool,
] as const;

export type Tool = (typeof tools)[number];

/**
 * Holds the active tool, and each tool's key selects it in either layout. The Brush's key, pressed on
 * the Brush, switches it between color and mask.
 */
export function ToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>(adjust);
  const brush = useBrushTool();
  const document = useDocument();
  function select(entry: Tool) {
    if (entry.id === "color-range") {
      const selected = document.selection.getState().layerId;
      const layer = findLayer(document.scene.getState().layers, selected);
      if (layer?.kind !== "mask" || layer.mask.kind !== "color-range") {
        return;
      }
    }
    if (entry === tool && entry.id === "brush") {
      brush.update({
        mode: brush.settings.mode === "color" ? "mask" : "color",
      });
      return;
    }
    setTool(entry);
  }
  useShortcuts(
    Object.fromEntries(
      tools.map((entry) => [entry.key, () => select(entry)] as const),
    ),
  );
  return <ToolContext value={{ tool, setTool }}>{children}</ToolContext>;
}
