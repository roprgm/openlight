import { createContext, type ReactNode, useContext, useState } from "react";
import { AdjustIcon } from "@/components/icons/adjust";
import { CropIcon } from "@/components/icons/crop";
import { ExportIcon } from "@/components/icons/export";
import { CropEditor } from "@/features/crop/view";
import { useGradientTool } from "@/features/layers/gradient-tool";
import { AdjustPanel } from "./adjust";
import { ExportMode } from "./export";

const ModeContext = createContext<{
  mode: Mode;
  setMode: (mode: Mode) => void;
} | null>(null);

export function useMode() {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error("A mode provider is required.");
  }
  return context;
}

const adjust = {
  id: "adjust",
  label: "Adjust",
  key: "a",
  Icon: AdjustIcon,
  group: "edit",
  Panel: AdjustPanel,
} as const;

/**
 * A mode edits over the shared canvas through a Panel, or brings its own View with a viewport and panel.
 * The output mode opens from the header rather than the rail.
 */
export const modes = [
  adjust,
  {
    id: "crop",
    label: "Crop",
    key: "c",
    Icon: CropIcon,
    group: "edit",
    View: CropEditor,
  },
  {
    id: "export",
    label: "Export",
    key: "e",
    Icon: ExportIcon,
    group: "output",
    View: ExportMode,
  },
] as const;

export type Mode = (typeof modes)[number];

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<Mode>(adjust);
  const tool = useGradientTool();
  function setMode(mode: Mode) {
    tool.close();
    updateMode(mode);
  }
  return <ModeContext value={{ mode, setMode }}>{children}</ModeContext>;
}
