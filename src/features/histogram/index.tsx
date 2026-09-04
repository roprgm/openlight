import { type ComponentProps, useCallback } from "react";
import type { Target } from "vgpu";
import type { createHistogram } from "./histogram";

type Props = ComponentProps<"svg"> & {
	histogram: ReturnType<typeof createHistogram>;
	image: () => Target;
	colors: readonly [string] | readonly [string, string, string];
	working?: boolean;
};

export function Histogram({
	histogram,
	image,
	colors,
	working,
	...props
}: Props) {
	const attach = useCallback(
		(svg: SVGSVGElement | null) => {
			if (svg) {
				return histogram.attach(svg, image, colors, working);
			}
		},
		[histogram, image, colors, working],
	);
	return (
		<svg
			ref={attach}
			aria-label="Histogram"
			viewBox="0 0 255 100"
			preserveAspectRatio="none"
			{...props}
		/>
	);
}
