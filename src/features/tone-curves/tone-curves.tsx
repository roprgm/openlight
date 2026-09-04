import type { ReactNode } from "react";
import { type Curve, defaultCurve } from "./curve";
import { Graph } from "./graph";

type ToneCurvesProps = {
	points: Curve;
	onChange: (points: Curve) => void;
	children?: ReactNode;
};

export function ToneCurves({ points, onChange, children }: ToneCurvesProps) {
	return (
		<section aria-label="Curves" className="space-y-2.5 p-4 shadow-ridge">
			<div className="flex items-center justify-between">
				<h2 className="text-sm text-neutral-400">Curves</h2>
				<button
					aria-label="Reset curve"
					className="flex size-5 cursor-pointer items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-300 focus-visible:outline-1 focus-visible:outline-neutral-400"
					onClick={() => onChange(defaultCurve)}
					title="Reset curve"
					type="button"
				>
					<svg
						aria-hidden="true"
						className="size-3.5"
						fill="none"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="1.5"
						viewBox="0 0 24 24"
					>
						<path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" />
					</svg>
				</button>
			</div>
			<div className="px-0.5">
				<div className="relative aspect-square rounded border border-black bg-neutral-900 shadow-groove">
					{children}
					<Graph onChange={onChange} points={points} />
				</div>
			</div>
		</section>
	);
}
