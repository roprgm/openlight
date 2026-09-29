import { Slider } from "@roprgm/ui/slider";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { EditorDocument, Grain } from "@/core/document";
import { setGrain } from "./edits";
import { defaultGrain } from "./model";

export function grainParameters(
  document: EditorDocument,
  id: string,
  grain: Grain,
): Parameter[] {
  const controls = [
    ["amount", "Amount"],
    ["size", "Size"],
    ["roughness", "Roughness"],
  ] as const;
  return controls.map(([name, label]) => ({
    id: name,
    label,
    value: grain[name],
    min: 0,
    max: 100,
    defaultValue: defaultGrain[name],
    onChange: (value) => setGrain(document, { [name]: value }, id),
  }));
}

export function GrainControls({ id, grain }: { id: string; grain: Grain }) {
  const document = useDocument();
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      {grainParameters(document, id, grain).map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} />
      ))}
    </section>
  );
}
