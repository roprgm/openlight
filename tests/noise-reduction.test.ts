import { expect, test } from "bun:test";
import { anchorShares, anchors } from "@/features/noise-reduction/model";
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
    // Each block averages 16 squared details: chi-squared with 16 degrees of freedom around the noise.
    let sum = 0;
    for (let k = 0; k < 16; k++) sum += normal() ** 2;
    const noise = (32 * mean + 1500) * (sum / 16);
    // A third of the blocks hold texture as well as noise.
    const texture = i % 3 === 0 ? (1 + 10 * random()) * noise : 0;
    means.push(mean);
    variances.push(noise + texture);
  }
  // Texture in every bin lifts its quietest tenth a little, never to the textured blocks' level.
  const { gain, floor } = fitNoise(means, variances);
  expect(Math.abs(gain / 32 - 1)).toBeLessThan(0.15);
  expect(Math.abs(floor / 1500 - 1)).toBeLessThan(0.15);
});

test("noise reduction amounts scale the noise filtered between the anchors", () => {
  expect(anchorShares(0)).toEqual([0, 0, 0]);
  expect(anchorShares(10)).toEqual([0.4, 0, 0]);
  expect(anchorShares(25)).toEqual([1, 0, 0]);
  expect(anchorShares(37.5)).toEqual([0.5, 0.5, 0]);
  expect(anchorShares(75)).toEqual([0, 0.5, 0.5]);
  expect(anchorShares(100)).toEqual([0, 0, 1]);
  // Shares blend anchors linearly, so the noise filtered follows the amount on one line.
  for (const amount of [10, 25, 40, 60, 90]) {
    const strength = anchorShares(amount).reduce(
      (sum, share, k) => sum + share * anchors[k],
      0,
    );
    expect(strength).toBeCloseTo((amount / 100) * anchors[2], 10);
  }
});
