import { compute, frameLoop, type Gpu, type Target } from "vgpu";
import shader from "./histogram.wgsl";

export function createHistogram(gpu: Gpu) {
	const bins = gpu.device.createBuffer({
		size: 3072,
		usage: ["storage", "copy_dst"],
	});
	const heights = gpu.device.createBuffer({
		size: 3072,
		usage: ["storage", "copy_src"],
	});
	const count = compute(gpu, shader, { entry: "count", set: { bins } });
	const finish = compute(gpu, shader, {
		entry: "finish",
		set: { bins, heights },
	});
	const empty = new Uint32Array(768);
	async function read(image: Target, working = false, channels: 1 | 3 = 3) {
		const params = { working: Number(working), channels };
		bins.write(empty);
		count.set({ source: image.color, params }).dispatch(32, 20);
		finish.set({ params }).dispatch(1);
		return new Float32Array(await heights.read(channels * 1024));
	}
	return {
		read,
		attach(
			svg: SVGSVGElement,
			image: () => Target,
			colors: readonly [string] | readonly [string, string, string],
			working = false,
		) {
			const namespace = "http://www.w3.org/2000/svg";
			const plot = document.createElementNS(namespace, "g");
			const curves = colors.map((color) => {
				const polygon = document.createElementNS(namespace, "polygon");
				const polyline = document.createElementNS(namespace, "polyline");
				polygon.setAttribute("fill", color);
				polygon.setAttribute("stroke", "none");
				polyline.setAttribute("fill", "none");
				polyline.setAttribute("stroke", color);
				polyline.setAttribute("vector-effect", "non-scaling-stroke");
				plot.append(polygon, polyline);
				return { polygon, polyline };
			});
			svg.append(plot);
			let pending = false;
			const loop = frameLoop(gpu, async () => {
				if (pending) {
					return;
				}
				pending = true;
				try {
					const values = await read(image(), working, colors.length);
					curves.forEach(({ polygon, polyline }, channel) => {
						const points = Array.from(
							values.subarray(channel * 256, (channel + 1) * 256),
							(y, x) => `${x},${y.toFixed(1)}`,
						).join(" ");
						polygon.setAttribute("points", `0,100 ${points} 255,100`);
						polyline.setAttribute("points", points);
					});
				} catch (error) {
					if (plot.isConnected) {
						console.error(error);
					}
				} finally {
					pending = false;
				}
			});
			return () => {
				loop.stop();
				plot.remove();
			};
		},
		dispose() {
			bins.dispose();
			heights.dispose();
		},
	};
}
