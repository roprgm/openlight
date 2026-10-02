import { Select } from "@roprgm/ui/select";
import { ColorInput } from "@/components/editor/color-input";
import { useDocument } from "@/components/editor/session";
import type { Fill } from "@/core/document";
import { blends } from "@/core/image/blend";
import { setFill } from "./edits";

export function FillControls({ id, fill }: { id: string; fill: Fill }) {
  const document = useDocument();
  return (
    <section className="flex flex-col gap-3 p-3.5">
      <label className="flex items-center justify-between text-secondary">
        Color
        <span className="flex items-center gap-2">
          <span className="text-foreground uppercase tabular-nums">
            {fill.color}
          </span>
          <ColorInput
            label="Color"
            value={fill.color}
            onChange={(color) => setFill(document, { color }, id)}
          />
        </span>
      </label>
      <div className="flex items-center justify-between text-secondary">
        Blend
        <Select
          raised
          aria-label="Blend"
          value={fill.blend}
          items={blends.map(([value, label]) => ({ value, label }))}
          className="w-28"
          onValueChange={(blend) => blend && setFill(document, { blend }, id)}
        />
      </div>
    </section>
  );
}
