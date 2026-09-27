import { Slider } from "@roprgm/ui/slider";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { Details, EditorDocument } from "@/core/document";
import { setDetails } from "./edits";
import { defaultDetails, detailLimits } from "./model";

const controls = [
  ["clarity", "Clarity", 1],
  ["sharpening", "Sharpening", 1],
  ["sharpenRadius", "Radius", 0.1],
] as const;

export function detailsParameters(
  document: EditorDocument,
  id: string,
  details: Readonly<Details>,
): Parameter[] {
  return controls.map(([name, label, step]) => ({
    id: name,
    label,
    value: details[name],
    min: detailLimits[name][0],
    max: detailLimits[name][1],
    step,
    defaultValue: defaultDetails[name],
    onChange: (value) => setDetails(document, { [name]: value }, id),
  }));
}

export function DetailsControls({
  id,
  details,
}: {
  id: string;
  details: Readonly<Details>;
}) {
  const document = useDocument();
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      {detailsParameters(document, id, details).map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} />
      ))}
    </section>
  );
}
