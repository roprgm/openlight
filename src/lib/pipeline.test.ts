import { expect, test } from "bun:test";
import { frame, init, target } from "vgpu/mock";
import { createPipeline, type ImageStage } from "./pipeline";

test("named image dependencies follow bypasses across frames and dispose in reverse order", async () => {
	const gpu = await init();
	const source = target(gpu, { size: [4, 4] });
	const filtered = target(gpu, { size: [4, 4] });
	const disposed: string[] = [];
	const inputs: unknown[] = [];
	const stages: ImageStage<boolean>[] = [
		{
			id: "filter",
			input: "source",
			render: (_frame, input, enabled) => (enabled ? filtered : input),
			dispose() {
				disposed.push("filter");
				filtered.color.dispose();
			},
		},
		{
			id: "original",
			input: "source",
			render: (_frame, input) => input,
			dispose() {
				disposed.push("original");
			},
		},
		{
			id: "output",
			input: "filter",
			render(_frame, input) {
				inputs.push(input);
				return input;
			},
			dispose() {
				disposed.push("output");
			},
		},
	];
	const pipeline = createPipeline(source, stages);
	try {
		expect(() => createPipeline(source, [stages[2]])).toThrow(
			"Invalid pipeline dependency",
		);
		expect(() => createPipeline(source, [stages[0], stages[0]])).toThrow(
			"Invalid pipeline dependency",
		);
		expect(() => pipeline.output("output")).toThrow("unavailable");
		for (const enabled of [true, false, true]) {
			frame(gpu, (f) => {
				expect(pipeline.render(f, enabled)).toBe(enabled ? filtered : source);
			});
			expect(pipeline.output("original")).toBe(source);
		}
		expect(inputs).toEqual([filtered, source, filtered]);
		pipeline.dispose();
		pipeline.dispose();
		expect(disposed).toEqual(["output", "original", "filter"]);
		expect(() => filtered.color.view).toThrow("destroyed");
		expect(() => source.color.view).not.toThrow();
		expect(() => pipeline.output("source")).toThrow("disposed");
	} finally {
		pipeline.dispose();
		source.color.dispose();
		gpu.dispose();
	}
});
