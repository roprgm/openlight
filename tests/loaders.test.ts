import { expect, test } from "bun:test";
import { createImageLayer, createLayer, createMask } from "@/app/editor/layers";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createLoaderRegistry, type FileLoader } from "@/app/loaders/registry";
import { createWorkspace } from "@/app/workspace";
import { createDocument } from "@/core/document";
import { canDecode } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { defaultAdjustments } from "@/features/adjustments/model";
import { addLayer } from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";

function settings(attributes: string, name = "photo.xmp") {
	return new File(
		[
			`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" ${attributes} /></rdf:RDF>`,
		],
		name,
	);
}

test("file batches preserve ordering, group imports, recover from failures, and discard stale settings", async () => {
	for (const name of ["mamiya.MEF", "epson.erf", "fuji.raf", "iphone.dng"]) {
		expect(canDecode(new File([], name))).toBe(true);
	}
	const workspace = createWorkspace();
	// Substitute decoding only; the registry, workspace, XMP parser, and documents are real.
	const image: FileLoader = {
		kind: "document",
		accepts: (file) => file.name.endsWith(".png"),
		load: (file) =>
			workspace.open(file.name, async () => {
				if (file.name === "broken.png") throw new Error("Decode failed");
				return createDocument({
					frame: imageFrame([32, 32]),
					layers: [{ ...createImageLayer(file.name, "Photo"), id: "base" }],
				});
			}),
	};
	const xmp = createCameraRawXmpLoader(workspace);
	const registry = createLoaderRegistry(
		[xmp, image],
		() => workspace.state.getState().status === "ready",
	);
	const photo = new File([], "photo.png");
	const exposure = settings('crs:Exposure2012="1.25"');
	try {
		await registry.openFiles([new File([], "notes.txt"), exposure]);
		expect(workspace.state.getState()).toEqual({ status: "empty" });
		for (const settingsFirst of [true, false]) {
			const parameters = settings(
				'crs:Exposure2012="1.25" crs:Contrast2012="-20" crs:Highlights2012="-50" crs:Shadows2012="50" crs:Whites2012="25" crs:Blacks2012="-25" crs:Vibrance="30" crs:Saturation="-10"',
				settingsFirst ? "photo.xml" : "photo.xmp",
			);
			const images = [photo, new File([], "broken.png")];
			await registry.openFiles(
				settingsFirst ? [parameters, ...images] : [...images, parameters],
			);
			const document = workspace.getDocument();
			expect(workspace.state.getState().file).toBe("photo.png");
			const imported = {
				...defaultAdjustments,
				exposure: 1.25,
				contrast: -20,
				highlights: -50,
				shadows: 50,
				whites: 25,
				blacks: -25,
				vibrance: 30,
				saturation: -10,
			};
			expect(document.scene.getState().layers[0].adjustments).toEqual(imported);
			await registry.openFiles([
				settings('crs:Exposure2012="3"'),
				settings('crs:Exposure2012="-1"'),
			]);
			expect(document.scene.getState().layers[0].adjustments).toEqual({
				...imported,
				exposure: -1,
			});
			document.history.undo();
			expect(document.scene.getState().layers[0].adjustments.exposure).toBe(3);
			document.history.redo();
			document.history.begin();
			setAdjustments(document, { contrast: 20 });
			setAdjustments(document, { contrast: 30 });
			await registry.openFiles([
				settings(
					'crs:Highlights2012="0" crs:Shadows2012="0" crs:Whites2012="0" crs:Blacks2012="0"',
				),
			]);
			expect(document.history.status.getState()).toEqual({
				undoCount: 5,
				redoCount: 0,
			});
			expect(document.scene.getState().layers[0].adjustments).toMatchObject({
				highlights: 0,
				shadows: 0,
				whites: 0,
				blacks: 0,
			});
			document.history.undo();
			expect(document.scene.getState().layers[0].adjustments).toEqual({
				...imported,
				exposure: -1,
				contrast: 30,
			});
			document.history.undo();
			expect(document.scene.getState().layers[0].adjustments.contrast).toBe(
				-20,
			);
		}
		const document = workspace.getDocument();
		const maskId = addLayer(document, createMask(defaultGradient([32, 32])));
		addLayer(document, createLayer("details"), { inside: maskId });
		const beforeDetails = document.scene.getState();
		await xmp.load(settings('crs:Exposure2012="0.5" crs:Clarity2012="35"'));
		expect(document.scene.getState().layers[2]).toMatchObject({
			kind: "details",
			details: { clarity: 35 },
		});
		expect(document.scene.getState().layers[0].adjustments.exposure).toBe(0.5);
		expect(document.scene.getState().layers[1]).toBe(beforeDetails.layers[1]);
		document.history.undo();
		expect(document.scene.getState()).toEqual(beforeDetails);
		document.history.redo();
		await xmp.load(settings('crs:Clarity2012="0"'));
		expect(document.scene.getState().layers).toHaveLength(3);
		expect(document.scene.getState().layers[2]).toMatchObject({
			details: { clarity: 0 },
		});
		expect(document.scene.getState().layers[1]).toBe(beforeDetails.layers[1]);
		await Promise.all([
			registry.openFiles([exposure, new File([], "first.png")]),
			registry.openFiles([
				new File([], "second.png"),
				settings('crs:Contrast2012="20"'),
			]),
		]);
		expect(workspace.state.getState().file).toBe("second.png");
		expect(
			workspace.getDocument().scene.getState().layers[0].adjustments,
		).toEqual({
			...defaultAdjustments,
			contrast: 20,
		});
		await registry.openFiles([exposure, new File([], "broken.png")]);
		expect(workspace.state.getState()).toMatchObject({
			status: "error",
			file: "broken.png",
			error: "Error: Decode failed",
		});
		await registry.openFiles([exposure, photo]);
		const recovered = workspace.getDocument();
		expect(recovered.scene.getState().layers[0].adjustments.exposure).toBe(
			1.25,
		);
		await expect(
			registry.openFiles([settings('crs:Exposure2012="99"')]),
		).rejects.toThrow("Invalid adjustment");
		await registry.openFiles([
			settings('crs:Contrast2012="10" crs:Exposure2012="NaN"'),
		]);
		expect(recovered.scene.getState().layers[0].adjustments).toEqual({
			...defaultAdjustments,
			exposure: 1.25,
			contrast: 10,
		});

		// Hold file reading so replacement happens before the old import completes.
		const text = Promise.withResolvers<string>();
		const delayed = settings('crs:Exposure2012="4"');
		delayed.text = () => text.promise;
		const pending = xmp.load(delayed);
		await registry.loadFile(image, photo);
		text.resolve(await exposure.text());
		await pending;
		expect(workspace.getDocument()).not.toBe(recovered);
		expect(
			workspace.getDocument().scene.getState().layers[0].adjustments,
		).toEqual(defaultAdjustments);
	} finally {
		workspace.dispose();
	}
});
