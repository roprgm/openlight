import { useMemo, useRef, useState } from "react";
import { compute, storage, type Target } from "vgpu";
import { useFrameLoop, useGpu } from "vgpu-react";
import shader from "./bins.wgsl";

const channels = ["#f25445", "#6bd175", "#5c8ffa"];
const empty = new Uint32Array(769);

/** Bins a 512×320 sampling of the displayed image on the GPU, as often as the readback allows. */
function useBins(image: Target) {
	const gpu = useGpu();
	const [bins, setBins] = useState(empty);
	const buffer = useMemo(() => storage(gpu, empty.byteLength), [gpu]);
	const counter = useMemo(
		() => compute(gpu, shader, { set: { bins: buffer } }),
		[gpu, buffer],
	);
	const reading = useRef(false);

	useFrameLoop(() => {
		if (reading.current) {
			return;
		}
		reading.current = true;
		buffer.write(empty);
		counter.set({ source: image.color }).dispatch(32, 20);
		buffer.read().then((data) => {
			reading.current = false;
			setBins(new Uint32Array(data));
		});
	});

	return bins;
}

/** One channel as "x,y" pairs on a 255×100 box: 5-tap smoothed, square-root scaled to the interior peak. */
function curve(bins: Uint32Array, channel: number) {
	const peak = Math.max(bins[768], 1);
	return Array.from({ length: 256 }, (_, bin) => {
		let sum = 0;
		for (let k = -2; k <= 2; k++) {
			const i = Math.min(255, Math.max(0, bin + k));
			sum += bins[channel * 256 + i] * (3 - Math.abs(k));
		}
		return `${bin},${(100 - 100 * Math.sqrt(sum / 9 / peak)).toFixed(1)}`;
	}).join(" ");
}

type HistogramProps = { image: Target };

export default function Histogram({ image }: HistogramProps) {
	const bins = useBins(image);
	return (
		<svg
			className="h-24 w-full"
			preserveAspectRatio="none"
			viewBox="0 0 255 100"
		>
			<title>Histogram</title>
			{channels.map((color, channel) => {
				const points = curve(bins, channel);
				return (
					<g key={color}>
						<polygon
							fill={color}
							fillOpacity={0.2}
							points={`0,100 ${points} 255,100`}
						/>
						<polyline
							fill="none"
							points={points}
							stroke={color}
							vectorEffect="non-scaling-stroke"
						/>
					</g>
				);
			})}
		</svg>
	);
}
