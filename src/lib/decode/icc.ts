import { mat3 } from "gl-matrix";

type Curve = (encoded: number) => number;
type Xyz = [number, number, number];
export type IccColor = { matrix: mat3; curves: [Curve, Curve, Curve] };

const d50: Xyz = [0.9642, 1, 0.8249];

/**
 * Matrix/TRC profiles: per-channel curves to linear, then a column-major RGB → XYZ (D50) matrix.
 * Returns undefined for profiles that need lookup tables or lack these tags.
 */
export function parseIcc(bytes: Uint8Array): IccColor | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const text = (at: number) =>
		String.fromCharCode(...bytes.subarray(at, at + 4));
	const fixed = (at: number) => view.getInt32(at) / 65536;
	if (bytes.length < 132 || text(36) !== "acsp") {
		return;
	}
	const tags = new Map<string, number>();
	for (let i = 0, count = view.getUint32(128); i < count; i++) {
		tags.set(text(132 + i * 12), view.getUint32(136 + i * 12));
	}
	function xyz(name: string): Xyz | undefined {
		const at = tags.get(name);
		return at === undefined
			? undefined
			: [fixed(at + 8), fixed(at + 12), fixed(at + 16)];
	}
	function curve(name: string): Curve | undefined {
		const at = tags.get(name);
		if (at === undefined) {
			return;
		}
		if (text(at) === "curv") {
			const count = view.getUint32(at + 8);
			const entry = (i: number) =>
				view.getUint16(at + 12 + 2 * Math.min(i, count - 1)) / 65535;
			if (count === 0) {
				return (x) => x;
			}
			if (count === 1) {
				const gamma = view.getUint16(at + 12) / 256;
				return (x) => x ** gamma;
			}
			return (x) => {
				const position = x * (count - 1);
				const low = Math.floor(position);
				return entry(low) + (entry(low + 1) - entry(low)) * (position - low);
			};
		}
		if (text(at) === "para") {
			const kind = view.getUint16(at + 8);
			const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = Array.from(
				{ length: [1, 3, 4, 5, 7][kind] ?? 0 },
				(_, i) => fixed(at + 12 + i * 4),
			);
			return (x) =>
				kind === 0
					? x ** g
					: kind <= 2
						? x >= -b / a
							? (a * x + b) ** g + c
							: c
						: x >= d
							? (a * x + b) ** g + e
							: c * x + f;
		}
	}
	if (text(16) === "GRAY") {
		const k = curve("kTRC");
		return (
			k && {
				matrix: mat3.fromValues(...d50, 0, 0, 0, 0, 0, 0),
				curves: [k, k, k],
			}
		);
	}
	const [r, g, b] = [xyz("rXYZ"), xyz("gXYZ"), xyz("bXYZ")];
	const [rc, gc, bc] = [curve("rTRC"), curve("gTRC"), curve("bTRC")];
	if (text(16) !== "RGB " || !r || !g || !b || !rc || !gc || !bc) {
		return;
	}
	return { matrix: mat3.fromValues(...r, ...g, ...b), curves: [rc, gc, bc] };
}
