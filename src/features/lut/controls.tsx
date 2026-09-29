import { Button } from "@roprgm/ui/button";
import { ScrollText } from "@roprgm/ui/scroll-text";
import { useRef } from "react";
import { useDocument } from "@/components/editor/session";
import { readCubeFile } from "./cube";
import { setLut } from "./edits";
import { LutInput } from "./input";

/** The LUT's name and a way to replace its file; the layer's opacity sets its strength. */
export function LutControls({
  id,
  lut,
  onFailure,
}: {
  id: string;
  lut: string;
  onFailure: (file: string, error: unknown) => void;
}) {
  const document = useDocument();
  const input = useRef<HTMLInputElement>(null);
  async function replace(file: File) {
    try {
      const table = await readCubeFile(file);
      setLut(document, id, document.resources.addLut(file, table));
    } catch (error) {
      onFailure(file.name, error);
    }
  }
  return (
    <section className="flex items-center gap-3 p-3.5">
      <ScrollText className="min-w-0 flex-1 text-foreground">
        {document.resources.getLut(lut).name}
      </ScrollText>
      <Button size="sm" onClick={() => input.current?.click()}>
        Replace…
      </Button>
      <LutInput ref={input} onChoose={replace} />
    </section>
  );
}
