/** Per-channel [hue, saturation, luminance] shifts in -100..100. */
export type MixerChannel = readonly number[];
export type ColorMixer = readonly MixerChannel[];

/** Hue-ordered channels; the center hues mirror `centers` in mixer.wgsl. */
export const mixerChannels = [
	{ name: "Red", hue: 0 },
	{ name: "Orange", hue: 30 },
	{ name: "Yellow", hue: 60 },
	{ name: "Green", hue: 120 },
	{ name: "Aqua", hue: 180 },
	{ name: "Blue", hue: 240 },
	{ name: "Purple", hue: 270 },
	{ name: "Magenta", hue: 300 },
] as const;

export const defaultMixer: ColorMixer = mixerChannels.map(() => [0, 0, 0]);

export function validateMixer(mixer: unknown): asserts mixer is ColorMixer {
	if (!Array.isArray(mixer) || mixer.length !== mixerChannels.length) {
		throw new Error(
			`Invalid mixer: expected ${mixerChannels.length} [hue, saturation, luminance] channels.`,
		);
	}
	for (const channel of mixer) {
		if (
			!Array.isArray(channel) ||
			channel.length !== 3 ||
			!channel.every(
				(value) => Number.isFinite(value) && value >= -100 && value <= 100,
			)
		) {
			throw new Error(
				"Invalid mixer channel: expected [hue, saturation, luminance] in -100..100.",
			);
		}
	}
}
