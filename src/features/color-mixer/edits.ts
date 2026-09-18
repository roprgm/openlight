import type { EditorDocument } from "@/core/document";
import {
	channels,
	colors,
	defaultMixer,
	isNeutral,
	type MixerChange,
	type MixerColor,
} from "./model";

export function setColorMixer(
	document: EditorDocument,
	color: MixerColor,
	change: MixerChange,
) {
	const index = colors.findIndex(({ id }) => id === color);
	if (index < 0) {
		throw new Error(`Invalid color range: ${color}.`);
	}
	for (const [name, value] of Object.entries(change)) {
		if (
			!channels.some(({ id }) => id === name) ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			Math.abs(value) > 100
		) {
			throw new Error(`Invalid color mixer adjustment: ${name}.`);
		}
	}
	const scene = document.scene.getState();
	const current = scene.image.colorMixer ?? defaultMixer;
	const next = { ...current };
	for (const { id } of channels) {
		const value = change[id];
		if (value !== undefined && value !== current[id][index]) {
			next[id] = current[id].with(index, value);
		}
	}
	if (channels.every(({ id }) => current[id] === next[id])) {
		return;
	}
	document.edit({
		...scene,
		image: { ...scene.image, colorMixer: isNeutral(next) ? undefined : next },
	});
}

export function resetColorMixer(document: EditorDocument) {
	const scene = document.scene.getState();
	if (scene.image.colorMixer) {
		document.edit({
			...scene,
			image: { ...scene.image, colorMixer: undefined },
		});
	}
}
