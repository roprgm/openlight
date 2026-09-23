import { IconButton } from "@roprgm/ui/icon-button";
import { ListItem } from "@roprgm/ui/list-item";
import { Menu, MenuItem } from "@roprgm/ui/menu";
import { ScrollArea } from "@roprgm/ui/scroll-area";
import { Tooltip } from "@roprgm/ui/tooltip";
import {
  type ComponentType,
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useStore } from "zustand";
import { PanelHeader } from "@/components/editor/panel";
import { useDocument, useScene } from "@/components/editor/session";
import { Icon, type IconProps } from "@/components/icons/icon";
import {
  TreeDrag,
  type TreeDrop,
  useTreeDragItem,
} from "@/components/ui/tree-drag";
import { type EffectLayer, findLayer, type Layer } from "@/core/document";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { layerDrop } from "./drop";
import { deleteLayer, moveLayer, setLayer } from "./edits";
import { LayerName } from "./layer-name";
import { useMaskTool } from "./mask-tool";
import { LayerActions, MaskNesting } from "./menu";
import { ImageThumbnail, MaskThumbnail } from "./thumbnails";

/** How the stack shows and offers each effect kind; the app supplies them so this feature names no other. */
export type EffectKind = {
  readonly kind: EffectLayer["kind"];
  readonly label: string;
  readonly Icon?: ComponentType<IconProps>;
  /** Offered in the Add menu; tools create the others. */
  readonly addable: boolean;
};

function LayerThumbnail({
  layer,
  effects,
}: {
  layer: Layer;
  effects: readonly EffectKind[];
}) {
  if (layer.kind === "image") {
    return <ImageThumbnail />;
  }
  if (layer.kind === "mask") {
    return <MaskThumbnail layer={layer} />;
  }
  if (layer.kind === "fill") {
    return (
      <span
        role="img"
        aria-label="Color thumbnail"
        className="block size-8 shrink-0 rounded-sm border border-neutral-600"
        style={{ background: layer.fill.color }}
      />
    );
  }
  const Icon = effects.find(({ kind }) => kind === layer.kind)?.Icon;
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded border border-black/50 bg-neutral-950/40 text-neutral-400">
      {Icon && <Icon className="size-4" />}
    </span>
  );
}

/** Rows subscribe to selection themselves, so unchanged branches skip when a sibling edits. */
const LayerRow = memo(function LayerRow({
  layer,
  parent,
  depth,
  effects,
  onSelect,
}: {
  layer: Layer;
  parent?: Layer;
  depth: number;
  effects: readonly EffectKind[];
  onSelect: (id: string) => void;
}) {
  const document = useDocument();
  const selected = useStore(document.selection, (state) => state.layerId);
  const [collapsed, setCollapsed] = useState(false);
  const isImage = layer.kind === "image";
  const visible = isImage || layer.visible;
  useEffect(() => {
    if (findLayer(layer.children, selected)) {
      setCollapsed(false);
    }
  }, [layer.children, selected]);
  const expanded = !collapsed;
  const drag = useTreeDragItem(layer.id, {
    disabled: isImage,
    expanded: expanded && layer.children.length > 0,
  });
  const dragHandle = isImage ? {} : drag.handle;
  const chevronStyle = { transform: expanded ? "rotate(90deg)" : undefined };
  const isSubmask = layer.kind === "mask" && parent?.kind === "mask";
  const maskSign =
    layer.kind === "mask" && layer.operation === "subtract" ? "−" : "+";
  const expandLabel = `${expanded ? "Collapse" : "Expand"} ${layer.name}`;
  return (
    <>
      <ListItem
        ref={drag.ref}
        data-drop={drag.drop}
        data-dragging={drag.dragging}
        data-hidden={!visible}
        selected={selected === layer.id}
        muted={!visible}
        style={{ paddingLeft: depth * 12 }}
        className="gap-0 pr-1 pointer-coarse:h-12 data-[dragging=true]:opacity-40 data-[drop=inside]:ring-1 data-[drop=inside]:ring-blue-400 data-[drop=inside]:ring-inset data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:-top-px data-[drop=before]:before:border-t-2 data-[drop=before]:before:border-blue-400 data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:-bottom-px data-[drop=after]:after:border-b-2 data-[drop=after]:after:border-blue-400"
      >
        <Tooltip
          content={visible ? "Hide layer" : "Show layer"}
          disabled={isImage}
        >
          <button
            type="button"
            aria-label={`Show ${layer.name}`}
            aria-pressed={visible}
            disabled={isImage}
            onClick={() => {
              if (!isImage) {
                setLayer(document, layer.id, { visible: !visible });
              }
            }}
            className="grid h-full w-8 shrink-0 place-items-center text-neutral-400 hover:text-neutral-100 disabled:text-neutral-600 aria-[pressed=false]:text-neutral-600 pointer-coarse:w-11"
          >
            <Icon className="size-3.5">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </Icon>
          </button>
        </Tooltip>
        <button
          type="button"
          aria-label={`Select ${layer.name}`}
          onClick={() => onSelect(layer.id)}
          className="mr-2 shrink-0"
        >
          <LayerThumbnail layer={layer} effects={effects} />
        </button>
        <LayerName
          layer={layer}
          onSelect={() => onSelect(layer.id)}
          dragHandle={dragHandle}
        />
        {isSubmask && (
          <Tooltip
            content={
              maskSign === "+"
                ? `Adds to ${parent?.name}`
                : `Subtracts from ${parent?.name}`
            }
          >
            <span className="grid size-6 shrink-0 place-items-center text-neutral-500">
              {maskSign}
            </span>
          </Tooltip>
        )}
        {layer.children.length > 0 && (
          <button
            type="button"
            aria-label={expandLabel}
            aria-expanded={expanded}
            onClick={() => setCollapsed(expanded)}
            className="grid size-6 shrink-0 place-items-center text-neutral-500 hover:text-neutral-200"
          >
            <Icon className="size-3 transition-transform" style={chevronStyle}>
              <path d="m9 5 7 7-7 7" />
            </Icon>
          </button>
        )}
        {layer.kind === "image" && (
          <Tooltip content="The base image stays at the bottom">
            <span className="grid size-7 shrink-0 place-items-center text-neutral-500">
              <Icon className="size-3.5">
                <rect x="6" y="10" width="12" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </Icon>
            </span>
          </Tooltip>
        )}
        {layer.kind === "mask" && !parent && <MaskNesting layer={layer} />}
        {layer.kind !== "image" && (
          <LayerActions layer={layer} onSelect={onSelect} />
        )}
      </ListItem>
      {expanded &&
        layer.children
          .toReversed()
          .map((child) => (
            <LayerRow
              key={child.id}
              layer={child}
              parent={layer}
              depth={depth + 1}
              effects={effects}
              onSelect={onSelect}
            />
          ))}
    </>
  );
});

export function LayersControls({
  effects,
  onAdd,
}: {
  effects: readonly EffectKind[];
  onAdd: (kind: EffectLayer["kind"]) => void;
}) {
  const document = useDocument();
  const layers = useScene((scene) => scene.layers);
  const tool = useMaskTool();
  // Choosing a mask edits it with the tool of its shape; anything else leaves editing.
  const select = useCallback(
    (id: string) => {
      document.selectLayer(id);
      const layer = findLayer(document.scene.getState().layers, id);
      tool.edit(layer?.kind === "mask" ? layer.mask.kind : undefined);
    },
    [document, tool.edit],
  );
  // The stack owns deletion, so it works with any tool on the canvas.
  function remove() {
    const id = document.selection.getState().layerId;
    if (findLayer(layers, id)?.kind !== "image") {
      deleteLayer(document, id);
    }
  }
  useShortcuts({ delete: remove, backspace: remove });
  function drop(target: TreeDrop) {
    const position = layerDrop(document.scene.getState(), target);
    if (position) {
      moveLayer(document, target.id, position.index, position.parentId);
      select(target.id);
    }
  }

  return (
    <section
      aria-label="Layers"
      className="grid max-h-1/2 min-h-36 shrink-0 grid-rows-[auto_minmax(0,1fr)] bg-panel"
    >
      <PanelHeader title="Layers">
        <Menu
          trigger={
            <IconButton
              label="Add effect"
              size="icon-sm"
              className="pointer-coarse:size-10"
            >
              <Icon className="size-4">
                <path d="M12 4v16M4 12h16" />
              </Icon>
            </IconButton>
          }
        >
          {effects
            .filter(({ addable }) => addable)
            .map(({ kind, label }) => (
              <MenuItem key={kind} onClick={() => onAdd(kind)}>
                {label}
              </MenuItem>
            ))}
        </Menu>
      </PanelHeader>
      <ScrollArea fade>
        <TreeDrag
          canDrop={(target) =>
            Boolean(layerDrop(document.scene.getState(), target))
          }
          onDrop={drop}
          label={(id) => findLayer(layers, id)?.name ?? id}
        >
          {layers.toReversed().map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              depth={0}
              effects={effects}
              onSelect={select}
            />
          ))}
        </TreeDrag>
      </ScrollArea>
    </section>
  );
}
