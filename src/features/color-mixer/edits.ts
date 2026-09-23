import {
  type ColorMixer,
  type EditorDocument,
  editLayer,
} from "@/core/document";
import { parse } from "@/lib/parse";
import {
  channels,
  colors,
  defaultMixer,
  type MixerChange,
  type MixerColor,
  mixerChange,
  mixerColor,
} from "./model";

function changeColorMixer(
  current: ColorMixer,
  color: MixerColor,
  change: MixerChange,
) {
  const selected = parse(mixerColor, color, "Invalid color range");
  const index = colors.findIndex(({ id }) => id === selected);
  const values = parse(mixerChange, change, "Invalid color mixer adjustment");
  const next = { ...current };
  for (const { id } of channels) {
    const value = values[id];
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
