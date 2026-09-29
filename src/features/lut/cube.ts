import type { LookupTable } from "@/core/document";
import { lutSizes } from "./model";

type Rgb = [number, number, number];

export const cubeExtension = ".cube";

export function isCubeFile(file: File) {
  return file.name.toLowerCase().endsWith(cubeExtension);
}

function numbers(tokens: readonly string[], count: number, at: string) {
  const values = tokens.map(Number);
  if (values.length !== count || !values.every(Number.isFinite)) {
    throw Error(
      `${at}: expected ${count > 1 ? `${count} numbers` : "a number"}.`,
    );
  }
  return values;
}

function rgb(tokens: readonly string[], at: string): Rgb {
  const [r, g, b] = numbers(tokens, 3, at);
  return [r, g, b];
}

/**
 * Reads an Adobe or Resolve `.cube` 3D LUT: keywords, then `LUT_3D_SIZE`³ rows of RGB with red
 * varying fastest. Other keywords are skipped; `name` stands in for a missing TITLE.
 */
export function readCube(
  text: string,
  name: string,
): { name: string; lut: LookupTable } {
  const [minSize, maxSize] = lutSizes;
  let title = name;
  let min: Rgb = [0, 0, 0];
  let max: Rgb = [1, 1, 1];
  let size = 0;
  const table: number[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n|\r/);
  for (const [index, line] of lines.entries()) {
    const [keyword, ...tokens] = line.trim().split(/\s+/);
    const at = `Line ${index + 1}`;
    if (!keyword || keyword.startsWith("#")) {
      continue;
    }
    switch (keyword) {
      case "TITLE":
        title =
          line
            .trim()
            .slice(keyword.length)
            .trim()
            .replace(/^"(.*)"$/, "$1") || name;
        break;
      case "LUT_1D_SIZE":
        throw Error("This is a 1D LUT; choose a 3D LUT.");
      case "LUT_3D_SIZE":
        if (size) {
          throw Error(`${at}: LUT_3D_SIZE appears twice.`);
        }
        [size] = numbers(tokens, 1, at);
        if (!Number.isInteger(size) || size < minSize || size > maxSize) {
          throw Error(
            `${at}: LUT_3D_SIZE must be a whole number from ${minSize} to ${maxSize}.`,
          );
        }
        break;
      case "DOMAIN_MIN":
        min = rgb(tokens, at);
        break;
      case "DOMAIN_MAX":
        max = rgb(tokens, at);
        break;
      case "LUT_3D_INPUT_RANGE": {
        const [low, high] = numbers(tokens, 2, at);
        min = [low, low, low];
        max = [high, high, high];
        break;
      }
      default:
        if (/^[a-z_]/i.test(keyword)) {
          break;
        }
        if (!size) {
          throw Error(`${at}: the table starts before LUT_3D_SIZE.`);
        }
        if (table.length === 3 * size ** 3) {
          throw Error(`${at}: LUT_3D_SIZE ${size} needs ${size ** 3} rows.`);
        }
        table.push(...rgb([keyword, ...tokens], at));
    }
  }
  if (!size) {
    throw Error("LUT_3D_SIZE is missing, so this isn't a 3D LUT.");
  }
  if (table.length < 3 * size ** 3) {
    throw Error(
      `LUT_3D_SIZE ${size} needs ${size ** 3} rows; found ${table.length / 3}.`,
    );
  }
  if (min.some((low, channel) => low >= max[channel])) {
    throw Error("DOMAIN_MIN must be below DOMAIN_MAX in every channel.");
  }
  return { name: title, lut: { size, domain: [min, max], table } };
}

/** Reads a `.cube` file, named after its TITLE or else the file. */
export async function readCubeFile(file: File) {
  return readCube(await file.text(), file.name.replace(/\.[^.]*$/, ""));
}
