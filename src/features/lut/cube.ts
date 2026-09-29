import type { LookupTable } from "@/core/image/lut";

type Rgb = [number, number, number];

/** Editors write sizes up to 65; two points already span the domain. */
const maxSize = 65;

export function isCubeFile(file: File) {
  return /\.cube$/i.test(file.name);
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
export function readCube(text: string, name: string): LookupTable {
  let title = name;
  let min: Rgb = [0, 0, 0];
  let max: Rgb = [1, 1, 1];
  let size = 0;
  let table: Float32Array<ArrayBuffer> | undefined;
  let filled = 0;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n|\r/);
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
        if (table) {
          throw Error(`${at}: LUT_3D_SIZE appears twice.`);
        }
        [size] = numbers(tokens, 1, at);
        if (!Number.isInteger(size) || size < 2 || size > maxSize) {
          throw Error(
            `${at}: LUT_3D_SIZE must be a whole number from 2 to 65.`,
          );
        }
        table = new Float32Array(3 * size ** 3);
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
        if (!table) {
          throw Error(`${at}: the table starts before LUT_3D_SIZE.`);
        }
        if (filled === table.length) {
          throw Error(`${at}: LUT_3D_SIZE ${size} needs ${size ** 3} rows.`);
        }
        table.set(rgb([keyword, ...tokens], at), filled);
        filled += 3;
    }
  }
  if (!table) {
    throw Error("LUT_3D_SIZE is missing, so this isn't a 3D LUT.");
  }
  if (filled < table.length) {
    throw Error(
      `LUT_3D_SIZE ${size} needs ${size ** 3} rows; found ${filled / 3}.`,
    );
  }
  if (min.some((low, channel) => low >= max[channel])) {
    throw Error("DOMAIN_MIN must be below DOMAIN_MAX in every channel.");
  }
  return { name: title, size, domain: [min, max], table };
}

/** Reads a `.cube` file, named after its TITLE or else the file. */
export async function readCubeFile(file: File) {
  return readCube(await file.text(), file.name.replace(/\.[^.]*$/, ""));
}
