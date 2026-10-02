import { createContext, type ReactNode, useContext, useState } from "react";
import { clamp } from "@/lib/math";
import type { Parameter } from "./parameter";

export type BrushShape = {
  /** Diameter in viewport pixels; BrushCanvas converts it to source pixels for each stroke. */
  size: number;
  feather: number;
  flow: number;
};

const maxSize = 1000;

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
  const [settings, setSettings] = useState<BrushShape>({
    size: 50,
    feather,
    flow: 1,
  });
  const [preview, setPreview] = useState(false);
  function resize(factor: number) {
    setSettings((settings) => ({
      ...settings,
      size: clamp(settings.size * factor, 1, maxSize),
    }));
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
  return {
    settings: { ...settings, size: Math.round(settings.size) },
    maxSize,
    preview,
    setPreview,
    update,
    resize,
  };
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
