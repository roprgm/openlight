const channels = ["#f25445", "#6bd175", "#5c8ffa"];
const binCount = 256;
const kernel = [1, 4, 6, 4, 1];
const kernelWeight = 16;

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
function curves(bins: Uint32Array) {
	const counts = channels.map((_, channel) => smooth(bins, channel));
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
export function histogramChart(svg: SVGSVGElement) {
	svg.innerHTML = `<title>Histogram</title>${channels
		.map(
			(color) =>
				`<g><polygon fill="${color}" fill-opacity="0.2"/><polyline fill="none" stroke="${color}" vector-effect="non-scaling-stroke"/></g>`,
		)
		.join("")}`;
	const polygons = svg.querySelectorAll("polygon");
	const lines = svg.querySelectorAll("polyline");
	return (bins: Uint32Array) => {
		curves(bins).forEach((points, channel) => {
			polygons[channel].setAttribute("points", `0,100 ${points} 255,100`);
			lines[channel].setAttribute("points", points);
		});
	};
}
