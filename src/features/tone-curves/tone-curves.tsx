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
        <h2 className="text-muted">Curves</h2>
        <Button
          variant="ghost"
          aria-label="Reset curve"
          size="sm"
          onClick={() => onChange(defaultCurve)}
        >
          Reset
        </Button>
      </div>
      <div className="px-0.5">
        <div className="relative aspect-square max-h-55 w-full rounded bg-field md:max-h-45">
          {children}
          <Graph onChange={onChange} points={points} />
          {/* A soft dark edge inside, over the histogram and grid, which would cover the box's own. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_1px_1px_var(--color-edge)] shadow-edge/50"
          />
        </div>
      </div>
    </section>
  );
}
