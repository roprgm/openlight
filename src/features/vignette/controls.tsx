import { Slider } from "@roprgm/ui/slider";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { EditorDocument, Vignette } from "@/core/document";
import { setVignette } from "./edits";
import { defaultVignette } from "./model";

export function vignetteParameters(
  document: EditorDocument,
  id: string,
  vignette: Vignette,
): Parameter[] {
  const controls = [
    ["intensity", "Intensity"],
    ["softness", "Softness"],
  ] as const;
  return controls.map(([name, label]) => ({
    id: name,
    label,
    value: vignette[name],
    min: 0,
    max: 100,
    defaultValue: defaultVignette[name],
    onChange: (value) => setVignette(document, { [name]: value }, id),
  }));
}

export function VignetteControls({
  id,
  vignette,
}: {
  id: string;
  vignette: Vignette;
}) {
  const document = useDocument();
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      {vignetteParameters(document, id, vignette).map(
        ({ id, ...parameter }) => (
          <Slider key={id} {...parameter} />
        ),
      )}
    </section>
  );
}
