import { IconButton } from "@roprgm/ui/icon-button";
import { Menu, MenuItem, MenuSeparator, Submenu } from "@roprgm/ui/menu";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
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
      {layer.kind === "mask" && !parent && (
        <>
          <NestingItems layer={layer} />
          <MenuSeparator />
        </>
      )}
      <MenuItem
        disabled={index === siblings.length - 1}
        onClick={() => moveLayer(document, layer.id, index + 1, parent?.id)}
      >
        Move up
      </MenuItem>
      <MenuItem
        disabled={index === bottom}
        onClick={() => moveLayer(document, layer.id, index - 1, parent?.id)}
      >
        Move down
      </MenuItem>
      {parent && <MenuItem onClick={moveOut}>Move out</MenuItem>}
      {containers.length > 0 && (
        <Submenu label="Move into">
          {containers.map((target) => (
            <MenuItem
              key={target.id}
              onClick={() =>
                moveLayer(document, layer.id, target.children.length, target.id)
              }
            >
              {target.name}
            </MenuItem>
          ))}
        </Submenu>
      )}
      <MenuSeparator />
      <MenuItem onClick={() => onSelect(duplicateLayer(document, layer.id))}>
        Duplicate
      </MenuItem>
      <MenuItem onClick={() => deleteLayer(document, layer.id)}>
        Delete
      </MenuItem>
    </>
  );
}

const shapes = [
  ["linear", "Linear gradient"],
  ["radial", "Radial gradient"],
  ["brush", "Brush"],
] as const;
const nestings = [
  ["add", "Add to mask"],
  ["subtract", "Subtract from mask"],
] as const;

/** Chooses the shape of the next mask and nests it inside this one, adding or subtracting coverage. */
function NestingItems({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const tool = useMaskTool();
  return nestings.map(([operation, label]) => (
    <Submenu key={operation} label={label}>
      {shapes.map(([shape, name]) => (
        <MenuItem
          key={shape}
          onClick={() => {
            document.selectLayer(layer.id);
            tool.add(layer.id, operation, shape);
          }}
        >
          {name}
        </MenuItem>
      ))}
    </Submenu>
  ));
}

export function LayerActions(props: {
  layer: ProcessingLayer;
  onSelect: (id: string) => void;
}) {
  return (
    <Menu
      trigger={
        <IconButton
          label={`${props.layer.name} actions`}
          size="icon-sm"
          className="pointer-coarse:size-10"
        >
          <Icon className="size-4">
            <path
              d="M5 12h.01M12 12h.01M19 12h.01"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </Icon>
        </IconButton>
      }
    >
      <LayerActionItems {...props} />
    </Menu>
  );
}
