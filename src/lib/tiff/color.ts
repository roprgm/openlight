import { mat3, vec3 } from "gl-matrix";
import { adaptation, d50, srgbToWorking, xyzToWorking } from "@/lib/color";
import { check, type Directory } from "./tiff";

const curveSize = 4096;
export function curves(functions: ((value: number) => number)[]) {
	const data = Float32Array.from({ length: curveSize * 3 }, (_, i) =>
		functions[Math.floor(i / curveSize)]((i % curveSize) / (curveSize - 1)),
	);
	check(data.every(Number.isFinite), "Invalid image transfer curve.");
	return data;
}
export const linear = (v: number) => v;
const srgb = (v: number) =>
	v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

function icc(bytes: number[]) {
	const view = new DataView(Uint8Array.from(bytes).buffer);
	check(
		bytes.length >= 132 &&
			view.getUint32(0) >= 132 &&
			view.getUint32(0) <= bytes.length &&
			view.getUint32(36) === 0x61637370,
		"Invalid ICC profile.",
	);
	const gray = view.getUint32(16) === 0x47524159;
	check(
		gray || view.getUint32(16) === 0x52474220,
		"Only RGB and grayscale ICC profiles are supported.",
	);
	check(
		view.getUint32(20) === 0x58595a20,
		"ICC profile requires an unsupported color transform.",
	);
	const tags = new Map<string, [number, number]>();
	const size = view.getUint32(0);
	const count = view.getUint32(128);
	check(count <= 128 && 132 + count * 12 <= size, "Invalid ICC tag table.");
	for (let i = 0; i < count; i++) {
		const at = 132 + i * 12,
			start = view.getUint32(at + 4),
			length = view.getUint32(at + 8);
		check(
			start >= 132 + count * 12 && length >= 8 && start + length <= size,
			"Invalid ICC tag offset.",
		);
		tags.set(String.fromCharCode(...bytes.slice(at, at + 4)), [
			start,
			start + length,
		]);
	}
	check(
		![...tags.keys()].some((key) => /^(A2B|B2A|D2B|B2D)/.test(key)),
		"ICC lookup-table profiles are not supported yet.",
	);
	const fixed = (at: number) => view.getInt32(at) / 65536;
	function curve(name: string) {
		const [at, end] = tags.get(name) ?? [0, 0];
		check(end - at >= 12, `Invalid or missing ICC ${name}.`);
		const type = view.getUint32(at);
		if (type === 0x63757276) {
			const count = view.getUint32(at + 8);
			check(count <= 65536 && at + 12 + count * 2 <= end, "Invalid ICC curve.");
			if (!count) {
				return linear;
			}
			if (count === 1) {
				const gamma = view.getUint16(at + 12) / 256;
				return (x: number) => x ** gamma;
			}
			return (x: number) => {
				const position = x * (count - 1),
					i = Math.floor(position),
					t = position - i;
				return (
					(view.getUint16(at + 12 + i * 2) * (1 - t) +
						view.getUint16(at + 12 + Math.min(i + 1, count - 1) * 2) * t) /
					65535
				);
			};
		}
		check(type === 0x70617261, "Unsupported ICC transfer curve.");
		const kind = view.getUint16(at + 8),
			counts = [1, 3, 4, 5, 7];
		check(
			kind <= 4 && at + 12 + counts[kind] * 4 <= end,
			"Invalid ICC parametric curve.",
		);
		const [g, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = Array.from(
			{ length: counts[kind] },
			(_, i) => fixed(at + 12 + i * 4),
		);
		check(g > 0 && a > 0, "Invalid ICC curve parameters.");
		return (x: number) => {
			if (!kind) {
				return x ** g;
			}
			if (kind <= 2) {
				return x >= -b / a ? (a * x + b) ** g + c : c;
			}
			return x >= d ? (a * x + b) ** g + e : c * x + f;
		};
	}
	function xyz(name: string) {
		const [at, end] = tags.get(name) ?? [0, 0];
		check(
			end - at >= 20 && view.getUint32(at) === 0x58595a20,
			`Invalid ICC ${name}.`,
		);
		return [fixed(at + 8), fixed(at + 12), fixed(at + 16)];
	}
	const functions = gray
		? Array(3).fill(curve("kTRC"))
		: [curve("rTRC"), curve("gTRC"), curve("bTRC")];
	const columns = gray
		? [d50, [0, 0, 0], [0, 0, 0]]
		: [xyz("rXYZ"), xyz("gXYZ"), xyz("bXYZ")];
	const matrix = columns.flat();
	mat3.multiply(matrix, adaptation(d50), matrix);
	mat3.multiply(matrix, xyzToWorking, matrix);
	return {
		matrix,
		curves: curves(functions),
	};
}

function xyToXyz([x, y]: number[]) {
	return [x / y, 1, (1 - x - y) / y];
}

export function imageColor(image: Directory) {
	if (image.tags.has(34675)) {
		return icc(image.get(34675));
	}
	const primaries = image.get(319),
		white = image.get(318);
	let matrix = srgbToWorking;
	if (primaries.length === 6 && white.length === 2) {
		const basis = [0, 2, 4].flatMap((i) => xyToXyz(primaries.slice(i, i + 2)));
		const xyz = xyToXyz(white);
		const inverse: number[] = [];
		check(
			Math.abs(mat3.determinant(basis)) >= 1e-10 && mat3.invert(inverse, basis),
			"Singular image color matrix.",
		);
		const scale = vec3.transformMat3([], xyz, inverse);
		matrix = basis.map((v, i) => v * scale[Math.floor(i / 3)]);
		mat3.multiply(matrix, adaptation(xyz), matrix);
		mat3.multiply(matrix, xyzToWorking, matrix);
	}
	check(
		image.one(339, 1) !== 3 || primaries.length === 6,
		"Floating-point TIFF needs an embedded ICC profile or explicit TIFF primaries and white point.",
	);
	const transfer = image.get(301),
		bits = image.one(258, 8),
		count = 2 ** bits;
	if (transfer.length) {
		check(
			transfer.length === count || transfer.length === count * 3,
			"Invalid TIFF transfer table.",
		);
		return {
			matrix,
			curves: curves(
				[0, 1, 2].map((c) => (x: number) => {
					const position = x * (count - 1),
						lo = Math.floor(position),
						t = position - lo,
						offset = transfer.length === count ? 0 : c * count;
					return (
						(transfer[offset + lo] * (1 - t) +
							transfer[offset + Math.min(lo + 1, count - 1)] * t) /
						65535
					);
				}),
			),
		};
	}
	const transferCurve = image.one(339, 1) === 3 ? linear : srgb;
	return {
		matrix,
		curves: curves([transferCurve, transferCurve, transferCurve]),
	};
}
