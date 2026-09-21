import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from "react";
import { AdjustIcon } from "@/components/icons/adjust";
import { BrushIcon } from "@/components/icons/brush";
import { CropIcon } from "@/components/icons/crop";
import { ExportIcon } from "@/components/icons/export";
import { LinearGradientIcon } from "@/components/icons/linear-gradient";
import { RadialGradientIcon } from "@/components/icons/radial-gradient";
import { CropEditor } from "@/features/crop/view";
import { BrushOptions } from "@/features/layers/brush-options";
import { BrushOverlay } from "@/features/layers/brush-overlay";
import { GradientOverlay } from "@/features/layers/gradient-overlay";
import { ExportMode } from "./export";

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

/** No mask canvas: the selected layer is active for its sliders, but not being edited on the image. */
const adjust = {
  id: "adjust",
  label: "Adjust",
  key: "a",
  Icon: AdjustIcon,
  group: "edit",
} as const;

export const exportTool = {
  id: "export",
  label: "Export",
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
    key: "b",
    Icon: BrushIcon,
    group: "edit",
    Canvas: BrushOverlay,
    Options: BrushOptions,
  },
  {
    id: "linear",
    label: "Linear gradient",
    key: "l",
    Icon: LinearGradientIcon,
    group: "edit",
    Canvas: LinearCanvas,
  },
  {
    id: "radial",
    label: "Radial gradient",
    key: "r",
    Icon: RadialGradientIcon,
    group: "edit",
    Canvas: RadialCanvas,
  },
  {
    id: "crop",
    label: "Crop",
    key: "c",
    Icon: CropIcon,
    group: "edit",
    View: CropEditor,
  },
  exportTool,
] as const;

export type Tool = (typeof tools)[number];

export function ToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>(adjust);
  return <ToolContext value={{ tool, setTool }}>{children}</ToolContext>;
}
