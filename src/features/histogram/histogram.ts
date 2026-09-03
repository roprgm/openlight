const channels = ["#f25445", "#6bd175", "#5c8ffa"];
const binCount = 256;
const kernel = [1, 4, 6, 4, 1];
const kernelWeight = 16;

export type HistogramMode = "rgb" | "combined";

/** Applies the binomial kernel over one channel's soft-binned counts. */
function smooth(bins: Uint32Array, channel: number) {
	return Array.from({ length: binCount }, (_, bin) => {
		let sum = 0;
		for (let k = 0; k < kernel.length; k++) {
			const i = bin + k - 2;
			if (i >= 0 && i < binCount) {
				sum += bins[channel * binCount + i] * kernel[k];
			}
		}
		return sum / kernelWeight;
	});
}

/** RGB polyline points on a 255×100 box: smoothed, then square-root scaled to the shared peak. */
function curves(bins: Uint32Array, mode: HistogramMode) {
	let counts = channels.map((_, channel) => smooth(bins, channel));
	if (mode === "combined") {
		counts = [
			counts[0].map((count, bin) => count + counts[1][bin] + counts[2][bin]),
		];
	}
	const peak = Math.max(1, ...counts.flat());
	return counts.map((channel) =>
		channel
			.map((count, bin) => {
				const height = Math.sqrt(Math.min(1, count / peak));
				return `${bin},${(100 - 100 * height).toFixed(1)}`;
			})
			.join(" "),
	);
}

/** Binds a histogram output once; subsequent updates write directly to its SVG. */
export function histogramChart(
	svg: SVGSVGElement,
	mode: HistogramMode = "rgb",
) {
	let colors = channels;
	let opacity = 0.2;
	if (mode === "combined") {
		colors = ["#a3a3a3"];
		opacity = 0.65;
	}
	svg.innerHTML = `<title>Histogram</title>${colors
		.map(
			(color) =>
				`<g><polygon fill="${color}" fill-opacity="${opacity}"/><polyline fill="none" stroke="${color}" vector-effect="non-scaling-stroke"/></g>`,
		)
		.join("")}`;
	const polygons = svg.querySelectorAll("polygon");
	const lines = svg.querySelectorAll("polyline");
	return (bins: Uint32Array) => {
		curves(bins, mode).forEach((points, channel) => {
			polygons[channel].setAttribute("points", `0,100 ${points} 255,100`);
			lines[channel].setAttribute("points", points);
		});
	};
}
