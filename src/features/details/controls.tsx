import { Slider } from "@roprgm/ui/slider";
import { useDocument } from "@/components/editor/session";
import type { Details } from "@/core/document";
import { setDetails } from "./edits";
import { defaultDetails, detailLimits } from "./model";

export function DetailsControls({
  id,
  details,
}: {
  id: string;
  details: Readonly<Details>;
}) {
  const document = useDocument();
  const controls = [
    ["clarity", "Clarity", 1],
    ["sharpening", "Sharpening", 1],
    ["sharpenRadius", "Radius", 0.1],
  ] as const;
  return (
    <section className="flex flex-col gap-2 p-3">
      {controls.map(([name, label, step]) => (
        <Slider
          key={name}
          label={label}
          value={details[name]}
          min={detailLimits[name][0]}
          max={detailLimits[name][1]}
          step={step}
          defaultValue={defaultDetails[name]}
          onChange={(value) => setDetails(document, { [name]: value }, id)}
        />
      ))}
    </section>
  );
}
