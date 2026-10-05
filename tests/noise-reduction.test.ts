import { expect, test } from "bun:test";
import { fitNoise } from "@/features/noise-reduction/noise";

test("noise fits photon and read noise from the flattest blocks, past texture", () => {
  // A seeded generator, so the blocks are the same every run.
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const means: number[] = [];
  const variances: number[] = [];
  for (let i = 0; i < 20000; i++) {
    const mean = random() ** 2 * 4000;
    // Each block averages 64 squared details: chi-squared with 64 degrees of freedom around the noise.
    let sum = 0;
    for (let k = 0; k < 64; k++) sum += normal() ** 2;
    const noise = (32 * mean + 1500) * (sum / 64);
    // A third of the blocks hold texture as well as noise.
    const texture = i % 3 === 0 ? (1 + 10 * random()) * noise : 0;
    means.push(mean);
    variances.push(noise + texture);
  }
  // Textured blocks lift each bin's quietest quarter a little, never to their own level.
  const { gain, floor } = fitNoise(means, variances);
  expect(Math.abs(gain / 32 - 1)).toBeLessThan(0.1);
  expect(Math.abs(floor / 1500 - 1)).toBeLessThan(0.1);
});
