import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import { Menu } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import {
  findLayer,
  locateLayer,
  type MaskLayer,
  type ProcessingLayer,
} from "@/core/document";
import { deleteLayer, duplicateLayer, moveLayer } from "./edits";
import { useMaskTool } from "./mask-tool";

/** Mounted only while the menu is open, so rows do not track siblings and containers. */
function LayerActionItems({
  layer,
  onSelect,
}: {
  layer: ProcessingLayer;
  onSelect: (id: string) => void;
}) {
  const document = useDocument();
  const layers = useScene((scene) => scene.layers);
  const { siblings = [], parent } = locateLayer(layers, layer.id) ?? {};
  const index = siblings.findIndex((item) => item.id === layer.id);
  const containers = layers.filter(
    (item) =>
      layer.children.length === 0 &&
      item.kind !== "image" &&
      item.id !== parent?.id &&
      !findLayer([layer], item.id),
  );
  const bottom = !parent ? 1 : 0;
  function moveOut() {
    if (!parent) {
      return;
    }
    const index = layers.findIndex((item) => item.id === parent.id);
    moveLayer(document, layer.id, index + 1);
  }
  return (
    <>
      <button
        type="submit"
        disabled={index === siblings.length - 1}
        onClick={() => moveLayer(document, layer.id, index + 1, parent?.id)}
      >
        Move up
      </button>
      <button
        type="submit"
        disabled={index === bottom}
        onClick={() => moveLayer(document, layer.id, index - 1, parent?.id)}
      >
        Move down
      </button>
      {parent && (
        <button type="submit" onClick={moveOut}>
          Move out
        </button>
      )}
      {containers.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
          Move into
          <Select
            aria-label={`Move ${layer.name} into`}
            value=""
            className="max-w-32"
            onChange={(event) => {
              const target = findLayer(layers, event.target.value);
              if (target) {
                moveLayer(
                  document,
                  layer.id,
                  target.children.length,
                  target.id,
                );
              }
            }}
          >
            <option value="" disabled>
              Choose layer
            </option>
            {containers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="my-1 border-t border-white/10" />
      <button
        type="submit"
        onClick={() => onSelect(duplicateLayer(document, layer.id))}
      >
        Duplicate
      </button>
      <button type="submit" onClick={() => deleteLayer(document, layer.id)}>
        Delete
      </button>
    </>
  );
}

const shapes = [
  ["linear", "Linear gradient"],
  ["radial", "Radial gradient"],
  ["brush", "Brush"],
] as const;
const nestings = [
  ["add", "Add to", "M12 8.5v7M8.5 12h7"],
  ["subtract", "Subtract from", "M8.5 12h7"],
] as const;

/** Chooses the shape of the next mask and nests it inside this one, adding or subtracting coverage. */
export function MaskNesting({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const tool = useMaskTool();
  return nestings.map(([operation, verb, glyph]) => (
    <Menu
      key={operation}
      label={`${verb} ${layer.name}`}
      icon={
        <Icon className="size-4">
          <circle cx="12" cy="12" r="8" />
          <path d={glyph} />
        </Icon>
      }
    >
      {shapes.map(([shape, name]) => (
        <button
          key={shape}
          type="submit"
          onClick={() => {
            document.selectLayer(layer.id);
            tool.add(layer.id, operation, shape);
          }}
        >
          {name}
        </button>
      ))}
    </Menu>
  ));
}

export function LayerActions(props: {
  layer: ProcessingLayer;
  onSelect: (id: string) => void;
}) {
  return (
    <Menu
      label={`${props.layer.name} actions`}
      icon={
        <Icon className="size-4">
          <path
            d="M5 12h.01M12 12h.01M19 12h.01"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </Icon>
      }
    >
      <LayerActionItems {...props} />
    </Menu>
  );
}
