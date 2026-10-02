import { Button } from "@roprgm/ui/button";
import { cn } from "cn";
import type { ReactNode } from "react";
import type { ToneCurve } from "@/core/document";
import { defaultCurve } from "./curve";
import { Graph } from "./graph";

type ToneCurvesProps = {
  points: ToneCurve;
  onChange: (points: ToneCurve) => void;
  /** Only the graph, stretched to the height it is given; the caller places a reset. */
  fill?: boolean;
  children?: ReactNode;
};

export function ToneCurves({
  points,
  onChange,
  fill,
  children,
}: ToneCurvesProps) {
  return (
    <section
      aria-label="Curves"
      className={cn("flex flex-col gap-2.5", fill && "h-full")}
    >
      {!fill && (
        <div className="flex items-center justify-between">
          <h2 className="text-secondary">Curves</h2>
          <Button
            variant="ghost"
            aria-label="Reset curve"
            size="sm"
            onClick={() => onChange(defaultCurve)}
          >
            Reset
          </Button>
        </div>
      )}
      <div className={cn("px-0.5", fill && "min-h-0 flex-1")}>
        <div
          className={cn(
            "relative w-full rounded bg-field",
            fill ? "h-full" : "aspect-square max-h-45",
          )}
        >
          {children}
          <Graph onChange={onChange} points={points} />
        </div>
      </div>
    </section>
  );
}
