import {
  type ColorMixer,
  type EditorDocument,
  editLayer,
} from "@/core/document";
import {
  channels,
  colors,
  defaultMixer,
  type MixerChange,
  type MixerColor,
} from "./model";

export function changeColorMixer(
  current: ColorMixer,
  color: MixerColor,
  change: MixerChange,
) {
  const index = colors.findIndex(({ id }) => id === color);
  if (index < 0) {
    throw new Error(`Invalid color range: ${color}.`);
  }
  for (const [name, value] of Object.entries(change)) {
    if (
      !channels.some(({ id }) => id === name) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      Math.abs(value) > 100
    ) {
      throw new Error(`Invalid color mixer adjustment: ${name}.`);
    }
  }
  const next = { ...current };
  for (const { id } of channels) {
    const value = change[id];
    if (value !== undefined && value !== current[id][index]) {
      next[id] = current[id].with(index, value);
    }
  }
  return next;
}

export function setColorMixer(
  document: EditorDocument,
  color: MixerColor,
  change: MixerChange,
  id: string,
) {
  editLayer(document, id, (layer) => {
    if (layer.kind !== "color-mixer") {
      throw Error("Select a color mixer layer.");
    }
    return {
      ...layer,
      colorMixer: changeColorMixer(layer.colorMixer, color, change),
    };
  });
}

export function resetColorMixer(document: EditorDocument, id: string) {
  editLayer(document, id, (layer) => {
    if (layer.kind !== "color-mixer") {
      throw Error("Select a color mixer layer.");
    }
    return { ...layer, colorMixer: defaultMixer };
  });
}
