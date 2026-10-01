import { createContext, type ReactNode, useContext, useState } from "react";
import type { BrushStroke } from "@/core/document";
import { clamp } from "@/lib/math";
import type { Parameter } from "./parameter";
import { useDocument, useScene } from "./session";

export type BrushShape = Pick<BrushStroke, "size" | "feather" | "flow">;

type BrushSettings = {
  settings: BrushShape;
  maxSize: number;
  preview: boolean;
  setPreview: (preview: boolean) => void;
  update: (change: Partial<BrushShape>) => void;
  resize: (factor: number) => void;
};

export type BrushInput = BrushSettings & {
  parameters: [Parameter, Parameter];
};

/** Each brush family keeps its own settings for the lifetime of the document. */
export function useBrushSettings(feather: number) {
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const size = document.resources.get(sourceId).image.size;
  const longest = Math.max(...size);
  const maxSize = Math.max(1, Math.round(longest / 2));
  // 3% of the image in steps of 5, never under 10 px unless the image itself is that small.
  const initialSize = Math.min(
    maxSize,
    Math.max(10, Math.round((longest * 0.03) / 5) * 5),
  );
  const [settings, setSettings] = useState<BrushShape>({
    size: initialSize,
    feather,
    flow: 1,
  });
  const [preview, setPreview] = useState(false);
  function resize(factor: number) {
    setSettings((settings) => {
      const rounded = Math.round(settings.size * factor);
      const size =
        rounded === settings.size ? rounded + Math.sign(factor - 1) : rounded;
      return {
        ...settings,
        size: clamp(size, 1, maxSize),
      };
    });
  }
  function update(change: Partial<BrushShape>) {
    setSettings((settings) => ({
      ...settings,
      ...change,
      size: clamp(change.size ?? settings.size, 1, maxSize),
      feather: clamp(change.feather ?? settings.feather, 0, 1),
      flow: clamp(change.flow ?? settings.flow, 0, 1),
    }));
  }
  return { settings, maxSize, preview, setPreview, update, resize };
}

export function brushParameters({
  settings,
  maxSize,
  setPreview,
  update,
}: BrushSettings): [Parameter, Parameter] {
  return [
    {
      id: "size",
      label: "Size",
      value: settings.size,
      min: 1,
      max: maxSize,
      format: (value) => `${value}px`,
      valueWidth: `${maxSize}`.length,
      onEditingChange: setPreview,
      onChange: (size) => update({ size: Math.round(size) }),
    },
    {
      id: "feather",
      label: "Feather",
      value: Math.round(settings.feather * 100),
      min: 0,
      max: 100,
      origin: 0,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onEditingChange: setPreview,
      onChange: (value) => update({ feather: value / 100 }),
    },
  ];
}

const Input = createContext<BrushInput | null>(null);

export function BrushInputProvider({
  value,
  children,
}: {
  value: BrushInput;
  children: ReactNode;
}) {
  return <Input value={value}>{children}</Input>;
}

export function useBrushInput() {
  const input = useContext(Input);
  if (!input) throw Error("A brush input provider is required.");
  return input;
}
