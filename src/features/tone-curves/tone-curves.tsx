import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import { defaultCurve, type ToneCurve } from "@/lib/tone-curves/curve";
import { Graph } from "./graph";

type ToneCurvesProps = {
	points: ToneCurve;
	onChange: (points: ToneCurve) => void;
	children?: ReactNode;
};

export function ToneCurves({ points, onChange, children }: ToneCurvesProps) {
	return (
		<section aria-label="Curves" className="space-y-2.5">
			<div className="flex items-center justify-between">
				<h2 className="text-sm text-neutral-400">Curves</h2>
				<Button
					variant="ghost"
					aria-label="Reset curve"
					className="px-2 py-1 text-xs"
					onClick={() => onChange(defaultCurve)}
				>
					Reset
				</Button>
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
