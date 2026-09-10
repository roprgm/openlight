import { expect, mock, spyOn, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { decodeTiff } from "@/lib/decode/tiff";

const decode = mock();
mock.module("raw-webgpu", () => ({ decodeTiff: decode }));

test("TIFF transfer releases package pixels and owns or cleans up its destination", async () => {
	const gpu = await init();
	const input = target(gpu, { size: [7, 5], format: "rgba16float" });
	const disposed: (typeof input.color)[] = [];
	const disposeTexture = input.color.dispose;
	const cleanup = spyOn(
		Object.getPrototypeOf(input.color),
		"dispose",
	).mockImplementation(function (this: typeof input.color) {
		disposed.push(this);
		disposeTexture.call(this);
	});
	const submit = spyOn(gpu.gpu.queue, "submit");
	try {
		for (const fail of [false, true]) {
			disposed.length = 0;
			const dispose = mock(() => {});
			decode.mockResolvedValueOnce({
				texture: input.color.gpu,
				size: input.size,
				dispose,
			});
			if (fail) {
				submit.mockImplementationOnce(() => {
					throw Error("Transfer failed");
				});
			}
			const loading = decodeTiff(gpu, new File([], "photo.tif"));
			if (fail) {
				await expect(loading).rejects.toThrow("Transfer failed");
			} else {
				const source = await loading;
				expect(disposed).toHaveLength(0);
				expect(() => source.image.color.view).not.toThrow();
				source.dispose();
			}
			expect(dispose).toHaveBeenCalledTimes(1);
			expect(disposed).toHaveLength(1);
			expect(() => disposed[0].view).toThrow("destroyed");
		}
	} finally {
		cleanup.mockRestore();
		submit.mockRestore();
		input.color.dispose();
		gpu.dispose();
	}
});
