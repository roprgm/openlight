import { useMemo, useRef } from "react";
import { effect } from "vgpu";
import { useFrameLoop, useGpu, useSurface } from "vgpu-react";
import shader from "./shader.wgsl";

export default function App() {
	const gpu = useGpu();
	const pass = useMemo(() => effect(gpu, shader), [gpu]);
	const canvas = useRef<HTMLCanvasElement>(null);
	const target = useSurface(canvas);

	useFrameLoop((frame) => {
		if (target.current) {
			frame.pass(target.current, pass);
		}
	});

	return <canvas ref={canvas} />;
}
