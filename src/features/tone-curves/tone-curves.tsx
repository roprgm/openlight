import { Button } from "@roprgm/ui/button";
import type { ReactNode } from "react";
import type { ToneCurve } from "@/core/document";
import { defaultCurve } from "./curve";
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
        <h2 className="text-neutral-400">Curves</h2>
        <Button
          variant="ghost"
          aria-label="Reset curve"
          className="h-6 px-2"
          onClick={() => onChange(defaultCurve)}
        >
          Reset
        </Button>
      </div>
      <div className="px-0.5">
        <div className="relative aspect-square max-h-55 w-full rounded border border-black bg-neutral-900 shadow-sunken md:max-h-45">
          {children}
          <Graph onChange={onChange} points={points} />
        </div>
      </div>
    </section>
  );
}
