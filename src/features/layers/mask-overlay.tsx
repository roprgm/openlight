import { useId } from "react";
import type { Gradient, MaskLayer } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { MaskFill } from "./mask-fill";

type Modifier = Pick<MaskLayer, "id" | "mask" | "operation" | "opacity">;
type Rect = { x: number; y: number; width: number; height: number };

const tint = "#f25445";

/** Tints covered pixels red; additive children extend the coverage and subtractive children cut it. */
export function MaskOverlay({
	mask,
	modifiers,
	size,
	transform,
	clip,
}: {
	mask: Gradient;
	modifiers: readonly Modifier[];
	size: Point;
	/** Document pixels to screen pixels. */
	transform: string;
	/** The displayed image in screen pixels. */
	clip: Rect;
}) {
	const id = useId();
	const [width, height] = size;
	const adds = modifiers.filter((child) => child.operation === "add");
	const subtracts = modifiers.filter((child) => child.operation === "subtract");
	let coverage = (
		<g opacity="0.5" style={{ isolation: "isolate" }}>
			<rect width={width} height={height} fill={`url(#${id}-base)`} />
			{adds.map((child) => (
				<rect
					key={child.id}
					width={width}
					height={height}
					fill={`url(#${id}-${child.id})`}
					style={{ mixBlendMode: "plus-lighter" }}
				/>
			))}
		</g>
	);
	for (const child of subtracts) {
		coverage = <g mask={`url(#${id}-${child.id})`}>{coverage}</g>;
	}
	return (
		<svg
			aria-label="Mask overlay"
			role="img"
			className="pointer-events-none absolute inset-0 size-full overflow-visible"
		>
			<defs>
				<clipPath id={`${id}-clip`}>
					<rect {...clip} />
				</clipPath>
				<MaskFill id={`${id}-base`} mask={mask} color={tint} />
				{adds.map((child) => (
					<MaskFill
						key={child.id}
						id={`${id}-${child.id}`}
						mask={child.mask}
						color={tint}
						alpha={(coverage) => child.opacity * coverage}
					/>
				))}
				{subtracts.map((child) => (
					<mask
						key={child.id}
						id={`${id}-${child.id}`}
						maskUnits="userSpaceOnUse"
						x="0"
						y="0"
						width={width}
						height={height}
						style={{ maskType: "alpha" }}
					>
						<MaskFill
							id={`${id}-${child.id}-cut`}
							mask={child.mask}
							alpha={(coverage) => 1 - child.opacity * coverage}
						/>
						<rect
							width={width}
							height={height}
							fill={`url(#${id}-${child.id}-cut)`}
						/>
					</mask>
				))}
			</defs>
			<g clipPath={`url(#${id}-clip)`}>
				<g transform={transform}>{coverage}</g>
			</g>
		</svg>
	);
}
