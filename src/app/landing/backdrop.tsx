import { useRef } from "react";
import { clock } from "vgpu";
import { Canvas, useCanvas, useFrameLoop, useGpu, useShader } from "vgpu-react";
import usePointer from "@/hooks/use-pointer";
import shader from "./backdrop.wgsl";

const strength = { none: 0, hover: 0.05, drag: 1 };

function Glow() {
	const target = useCanvas();
	const time = clock(useGpu());
	const glow = useShader(shader);
	const pointer = usePointer();
	const pull = useRef(0);

	useFrameLoop((frame) => {
		const { x, y, mode } = pointer.current;
		const ease = 1 - Math.exp(-time.deltaTime * 8);
		pull.current += (strength[mode] - pull.current) * ease;
		glow.set({
			params: {
				pointer: [x, y],
				size: target.size,
				time: time.time,
				pull: pull.current,
			},
		});
		frame.pass(target, glow);
	});

	return null;
}

export default function Backdrop() {
	return (
		<Canvas className="absolute inset-0 -z-10 size-full" dpr={[1, 2]}>
			<Glow />
		</Canvas>
	);
}
