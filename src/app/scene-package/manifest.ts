import type { Scene } from "@/core/document";
import { validateFrame } from "@/core/image/frame";

export type AssetEntry = {
  id: string;
  role: "source";
  name: string;
  mediaType: string;
  path: string;
};
export type Manifest = {
  format: "openlight";
  version: 1;
  scene: Scene;
  assets: AssetEntry[];
};

const decoder = new TextDecoder("utf-8", { fatal: true });

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
  );
}

function stroke(value: unknown): boolean {
  return (
    record(value) &&
    (value.mode === "paint" || value.mode === "erase") &&
    [value.size, value.feather, value.flow].every(Number.isFinite) &&
    Array.isArray(value.points) &&
    value.points.every(
      (item: unknown) =>
        Array.isArray(item) && item.length === 3 && item.every(Number.isFinite),
    )
  );
}

function adjustments(value: unknown): boolean {
  return (
    record(value) &&
    [
      "exposure",
      "incrementalTemperature",
      "incrementalTint",
      "contrast",
      "highlights",
      "shadows",
      "whites",
      "blacks",
      "vibrance",
      "saturation",
    ].every((key) => Number.isFinite(value[key]))
  );
}

function curve(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (item: unknown, index: number) =>
        record(item) &&
        finite(item.x) &&
        finite(item.y) &&
        item.x >= 0 &&
        item.x <= 1 &&
        item.y >= 0 &&
        item.y <= 1 &&
        (index === 0 || item.x >= value[index - 1].x + 1 / 1024),
    ) &&
    value[0].x === 0 &&
    value[value.length - 1].x === 1
  );
}

function mask(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "linear") return point(value.start) && point(value.end);
  if (value.kind === "radial") {
    return (
      point(value.center) &&
      point(value.radius) &&
      Number.isFinite(value.angle) &&
      Number.isFinite(value.feather)
    );
  }
  return (
    value.kind === "brush" &&
    Array.isArray(value.strokes) &&
    value.strokes.every(stroke)
  );
}

function layerFields(value: unknown): value is Record<string, unknown> & {
  children: unknown[];
} {
  return (
    record(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    Array.isArray(value.children)
  );
}

function imageLayer(value: unknown): boolean {
  return (
    layerFields(value) &&
    value.kind === "image" &&
    typeof value.source === "string" &&
    adjustments(value.adjustments) &&
    curve(value.toneCurve) &&
    (value.whiteBalance === undefined ||
      (record(value.whiteBalance) &&
        Number.isFinite(value.whiteBalance.temperature) &&
        Number.isFinite(value.whiteBalance.tint))) &&
    value.children.every(processingLayer)
  );
}

function processingLayer(value: unknown): boolean {
  if (!layerFields(value)) return false;
  if (
    typeof value.visible !== "boolean" ||
    !Number.isFinite(value.opacity) ||
    !value.children.every(processingLayer)
  )
    return false;
  switch (value.kind) {
    case "details": {
      const details = value.details;
      return (
        record(details) &&
        ["clarity", "sharpening", "sharpenRadius"].every((key) =>
          Number.isFinite(details[key]),
        )
      );
    }
    case "exposure":
      return Number.isFinite(value.exposure);
    case "vignette":
      return (
        record(value.vignette) &&
        Number.isFinite(value.vignette.intensity) &&
        Number.isFinite(value.vignette.softness)
      );
    case "color-mixer": {
      const mixer = value.colorMixer;
      return (
        record(mixer) &&
        ["hue", "saturation", "luminance"].every((key) => {
          const channel = mixer[key];
          return (
            Array.isArray(channel) &&
            channel.length === 8 &&
            channel.every(Number.isFinite)
          );
        })
      );
    }
    case "fill":
      return (
        record(value.fill) &&
        typeof value.fill.color === "string" &&
        [
          "normal",
          "multiply",
          "screen",
          "overlay",
          "soft-light",
          "color",
          "luminosity",
        ].includes(String(value.fill.blend))
      );
    case "heal":
      return (
        Array.isArray(value.patches) &&
        value.patches.every(
          (patch: unknown) =>
            record(patch) &&
            typeof patch.id === "string" &&
            Number.isFinite(patch.feather) &&
            Number.isFinite(patch.opacity) &&
            point(patch.offset) &&
            stroke(patch.stroke),
        )
      );
    case "mask":
      return (
        (value.operation === "add" || value.operation === "subtract") &&
        mask(value.mask) &&
        adjustments(value.adjustments) &&
        curve(value.toneCurve)
      );
    default:
      return false;
  }
}

export function parseManifest(bytes: Uint8Array): Manifest {
  if (bytes.length > 1_000_000) throw new Error("Scene manifest is too large.");
  const value: unknown = JSON.parse(decoder.decode(bytes));
  if (
    !record(value) ||
    value.format !== "openlight" ||
    value.version !== 1 ||
    !record(value.scene) ||
    !Array.isArray(value.scene.layers) ||
    value.scene.layers.length === 0 ||
    !imageLayer(value.scene.layers[0]) ||
    !value.scene.layers.slice(1).every(processingLayer) ||
    !Array.isArray(value.assets)
  ) {
    throw new Error("Unsupported or invalid OpenLight scene.");
  }
  validateFrame(value.scene.frame as Scene["frame"]);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const source of value.assets) {
    if (
      !record(source) ||
      typeof source.id !== "string" ||
      !source.id ||
      source.role !== "source" ||
      typeof source.name !== "string" ||
      typeof source.mediaType !== "string" ||
      typeof source.path !== "string" ||
      !/^sources\/[0-9]+$/.test(source.path) ||
      ids.has(source.id) ||
      paths.has(source.path)
    )
      throw new Error("Invalid scene source entry.");
    ids.add(source.id);
    paths.add(source.path);
  }
  const referenced = new Set([String(value.scene.layers[0].source)]);
  if (
    referenced.size !== ids.size ||
    [...referenced].some((id) => !ids.has(id))
  ) {
    throw new Error("Scene sources do not match its image layers.");
  }
  return value as Manifest;
}
