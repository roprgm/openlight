import { Select } from "@roprgm/ui/select";
import { useDocument } from "@/components/editor/session";
import type { PaintLayer } from "@/core/document";
import { blends } from "@/core/image/blend";
import { setPaintBlend } from "./edits";

export function PaintControls({ layer }: { layer: PaintLayer }) {
  const document = useDocument();
  return (
    <section className="flex items-center justify-between p-3.5 text-secondary">
      Blend
      <Select
        raised
        aria-label="Blend"
        value={layer.blend}
        items={blends.map(([value, label]) => ({ value, label }))}
        className="w-28"
        onValueChange={(blend) =>
          blend && setPaintBlend(document, layer.id, blend)
        }
      />
    </section>
  );
}
