import { Slider } from "@roprgm/ui/slider";
import { useDocument } from "@/components/editor/session";
import type { Vignette } from "@/core/document";
import { setVignette } from "./edits";
import { defaultVignette } from "./model";

export function VignetteControls({
  id,
  vignette,
}: {
  id: string;
  vignette: Vignette;
}) {
  const document = useDocument();
  return (
    <section className="flex flex-col gap-1.5 p-(--padding)">
      <Slider
        label="Intensity"
        value={vignette.intensity}
        onChange={(intensity) => setVignette(document, { intensity }, id)}
        min={0}
        max={100}
        defaultValue={defaultVignette.intensity}
      />
      <Slider
        label="Softness"
        value={vignette.softness}
        onChange={(softness) => setVignette(document, { softness }, id)}
        min={0}
        max={100}
        defaultValue={defaultVignette.softness}
      />
    </section>
  );
}
