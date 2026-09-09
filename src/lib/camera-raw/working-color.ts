import { effect, type Frame, type Gpu, type Target, target } from "vgpu";
import type { WhiteBalance } from "@/lib/white-balance";
import shader from "./develop.wgsl";
import type { RawImage } from "./dng";
import { neutralForWhiteBalance } from "./white-balance";

/** Interactive camera white balance, color conversion, crop, and profile gains. */
export function createWorkingColor(gpu: Gpu, raw: RawImage) {
	const [x, y, width, height] = raw.crop;
	const map = raw.gainMap;
	const values = map?.values ?? new Float32Array([1]);
	const gains = gpu.device.createBuffer({
		size: values.byteLength,
		usage: ["storage", "copy_dst"],
	});
	gains.write(values);
	const output = target(gpu, {
		size: raw.orientation >= 5 ? [height, width] : [width, height],
		format: "rgba16float",
	});
	const params = {
		origin: [x, y],
		size: [width, height],
		orientation: raw.orientation,
		matrix: raw.matrix,
		neutral: raw.neutral,
		exposure: 2 ** raw.exposure,
	};
	const apply = effect(gpu, shader).set({
		gains,
		gainParams: {
			area: [
				raw.active[1],
				raw.active[0],
				raw.active[3] - raw.active[1],
				raw.active[2] - raw.active[0],
			],
			points: map?.points ?? [1, 1, 0],
			spacing: map?.spacing ?? [1, 1],
			origin: map?.origin ?? [0, 0],
			weights: map?.weights.slice(0, 3) ?? [0, 0, 0],
			minimum: map?.weights[3] ?? 0,
			maximum: map?.weights[4] ?? 0,
		},
	});
	let ownsOutput = true;
	let previous: WhiteBalance | undefined;
	let input: Target | undefined;
	return {
		render(frame: Frame, source: Target, balance = raw.whiteBalance?.asShot) {
			if (
				input === source &&
				previous?.temperature === balance?.temperature &&
				previous?.tint === balance?.tint
			)
				return output;
			const neutral =
				balance && raw.whiteBalance
					? neutralForWhiteBalance(raw.whiteBalance, balance)
					: raw.neutral;
			frame.pass(
				output,
				apply.set({ source: source.color, params: { ...params, neutral } }),
			);
			input = source;
			previous = balance;
			return output;
		},
		takeOutput() {
			ownsOutput = false;
			return output;
		},
		dispose() {
			gains.dispose();
			if (ownsOutput) output.color.dispose();
		},
	};
}
