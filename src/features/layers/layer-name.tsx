import { Tooltip } from "@roprgm/ui/tooltip";
import { type ComponentProps, useState } from "react";
import { useDocument } from "@/components/editor/session";
import type { Layer } from "@/core/document";
import { setLayer } from "./edits";

/** The row's name selects and drags the layer; a double-click renames any layer but the image. */
export function LayerName({
  layer,
  onSelect,
  dragHandle,
}: {
  layer: Layer;
  onSelect: () => void;
  dragHandle: ComponentProps<"button">;
}) {
  const document = useDocument();
  const [renaming, setRenaming] = useState(false);
  const [truncated, setTruncated] = useState(false);
  if (renaming) {
    return (
      <input
        aria-label="Layer name"
        ref={(input) => input?.select()}
        defaultValue={layer.name}
        className="min-w-0 flex-1 rounded border border-neutral-500 bg-neutral-900 px-1 text-neutral-100 outline-none"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.currentTarget.value = layer.name;
            event.currentTarget.blur();
          }
        }}
        onBlur={(event) => {
          const name = event.currentTarget.value.trim();
          if (name && name !== layer.name) {
            setLayer(document, layer.id, { name });
          }
          setRenaming(false);
        }}
      />
    );
  }
  function rename() {
    if (layer.kind !== "image") {
      setRenaming(true);
    }
  }
  // Only a name cut short needs its tooltip.
  return (
    <Tooltip content={layer.name} disabled={!truncated}>
      <button
        {...dragHandle}
        type="button"
        aria-label={layer.name}
        onClick={onSelect}
        onDoubleClick={rename}
        onPointerEnter={(event) =>
          setTruncated(
            event.currentTarget.scrollWidth > event.currentTarget.clientWidth,
          )
        }
        className="min-w-0 flex-1 self-stretch truncate text-left touch-manipulation cursor-grab active:cursor-grabbing"
      >
        {layer.name}
      </button>
    </Tooltip>
  );
}
