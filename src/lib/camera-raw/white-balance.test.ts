import { expect, test } from "bun:test";
import { readDng } from "./dng";
import { whiteBalanceToXyz, xyzToWhiteBalance } from "./temperature";
import { neutralForWhiteBalance, readWhiteBalance } from "./white-balance";

test("white balance recovers a D65 white with analog gains and retains the recorded neutral", async () => {
	// A synthetic XYZ camera with analog gains applied before storage: ignoring those gains gives a different white.
	const neutral = [0.95047 * 2, 1, 1.08883 * 3];
	const tags: Record<number, number[]> = {
		50721: [1, 0, 0, 0, 1, 0, 0, 0, 1],
		50727: [2, 1, 3],
		50778: [21],
	};
	const profile = readWhiteBalance(
		(tag, fallback = []) => tags[tag] ?? fallback,
		neutral,
	);
	expect(Math.abs(profile.asShot.temperature - 6504)).toBeLessThan(10);
	expect(profile.asShot.tint).toBeGreaterThan(0); // D65 is above the blackbody locus, not tint zero.
	expect(neutralForWhiteBalance(profile, profile.asShot)).toEqual(neutral);
	for (const temperature of [2000, 3000, 5000, 6504, 12000, 25000]) {
		for (const tint of [-50, 0, 50]) {
			const roundTrip = xyzToWhiteBalance(
				whiteBalanceToXyz({ temperature, tint }),
			);
			expect(Math.abs(roundTrip.temperature - temperature)).toBeLessThan(1);
			expect(Math.abs(roundTrip.tint - tint)).toBeLessThan(0.01);
		}
	}
	// AsShotWhiteXY is an alternative encoding of the same white, not a missing-neutral fallback.
	const xy = [0.95047, 1].map((v) => v / (0.95047 + 1 + 1.08883));
	const fromXy = readWhiteBalance(
		(tag, fallback = []) => (tag === 50729 ? xy : (tags[tag] ?? fallback)),
		[1, 1, 1],
	);
	expect(fromXy.asShot).toEqual(profile.asShot);
	fromXy.neutral.forEach((v, i) => {
		expect(Math.abs(v - neutral[i] / Math.max(...neutral))).toBeLessThan(0.001);
	});
	for (const file of ["bayer.dng", "linear.dng", "linear-jxl.dng"]) {
		const raw = readDng(
			await Bun.file(`${import.meta.dir}/fixtures/${file}`).arrayBuffer(),
		);
		if (!raw.whiteBalance) throw Error("Missing white balance");
		const { asShot } = raw.whiteBalance;
		expect(neutralForWhiteBalance(raw.whiteBalance, asShot)).toEqual(
			raw.neutral,
		);
		const nearby = neutralForWhiteBalance(raw.whiteBalance, {
			...asShot,
			temperature: asShot.temperature + 1,
		});
		nearby.forEach((v, i) => {
			expect(Math.abs(v - raw.neutral[i])).toBeLessThan(0.005);
		});
	}
	expect(() =>
		readWhiteBalance(
			(tag, fallback = []) =>
				tag === 50727 ? [0, 1, 1] : (tags[tag] ?? fallback),
			neutral,
		),
	).toThrow("analog balance");
});
