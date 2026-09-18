import type { Details } from "@/core/document";

export const defaultDetails: Details = {
	clarity: 0,
	sharpening: 0,
	sharpenRadius: 1,
};
export const detailLimits = {
	clarity: [-100, 100],
	sharpening: [0, 150],
	sharpenRadius: [0.5, 3],
} as const;

export function validateDetails(change: Partial<Details>) {
	for (const [name, value] of Object.entries(change)) {
		const limits = Object.entries(detailLimits).find(
			([key]) => key === name,
		)?.[1];
		if (
			!limits ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			value < limits[0] ||
			value > limits[1]
		) {
			throw Error(`Invalid detail adjustment: ${name}.`);
		}
	}
}
