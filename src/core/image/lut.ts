type Rgb = readonly [number, number, number];

/** A 3D color lookup table: `size`³ output colors for inputs spread evenly across `domain`. */
export type LookupTable = {
  /** Its TITLE, or the name of the file it came from. */
  readonly name: string;
  readonly size: number;
  readonly domain: readonly [min: Rgb, max: Rgb];
  /** RGB triplets, with the red input varying fastest, then green, then blue. */
  readonly table: Float32Array<ArrayBuffer>;
};
