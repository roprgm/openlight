import type { Gpu } from "vgpu";

export function summarize(values: number[]) {
	const sorted = values.toSorted((a, b) => a - b);
	return {
		samples: values,
		median:
			(sorted[Math.floor((sorted.length - 1) / 2)] +
				sorted[Math.ceil((sorted.length - 1) / 2)]) /
			2,
		p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
	};
}

/** Completed frames on an otherwise idle queue; readback is outside the wall-clock interval. */
export async function measureFrames(
	gpu: Gpu,
	render: () => void | Promise<void>,
	warmup: number,
	samples: number,
	readGpuMs?: () => number | undefined,
) {
	const encoding: number[] = [],
		completed: number[] = [],
		durations: number[] = [];
	for (let i = 0; i < warmup + samples; i++) {
		const start = performance.now();
		await render();
		const encoded = performance.now();
		await gpu.gpu.queue.onSubmittedWorkDone();
		const end = performance.now();
		await gpu.settled();
		if (i >= warmup) {
			encoding.push(encoded - start);
			completed.push(end - start);
			const duration = readGpuMs?.();
			if (duration !== undefined) {
				durations.push(duration);
			}
		}
	}
	return {
		cpuEncodeMs: summarize(encoding),
		completedMs: summarize(completed),
		gpuMs: durations.length ? summarize(durations) : null,
		missingGpuSamples: readGpuMs ? samples - durations.length : null,
	};
}
