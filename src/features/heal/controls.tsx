import { useDocument } from "@/components/editor/session";
import { Icon } from "@/components/icons/icon";
import { Menu } from "@/components/ui/menu";
import { PanelListItem } from "@/components/ui/panel-list";
import { ScrubInput } from "@/components/ui/scrub-input";
import type { HealPatch, SmartHealPatch } from "@/core/document";
import { deleteHealPatch, duplicateHealPatch, setHealSource } from "./edits";
import { useHealing } from "./mode";
import { PatchThumbnail } from "./thumbnail";

function PatchActions({
  layer,
  patch,
  next,
}: {
  layer: string;
  patch: HealPatch;
  next?: string;
}) {
  const document = useDocument();
  const { selectPatch } = useHealing();
  return (
    <Menu
      label="Patch actions"
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
      <button
        type="submit"
        onClick={() =>
          selectPatch(duplicateHealPatch(document, layer, patch.id))
        }
      >
        Duplicate
      </button>
      <button
        type="submit"
        onClick={() => {
          deleteHealPatch(document, layer, patch.id);
          selectPatch(next);
        }}
      >
        Delete
      </button>
    </Menu>
  );
}

function SourceFields({
  layer,
  patch,
  limit,
}: {
  layer: string;
  patch: SmartHealPatch;
  limit: readonly [number, number];
}) {
  const document = useDocument();
  const { selectPatch } = useHealing();
  const [destinationX, destinationY] = patch.stroke.points[0];
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onPointerDownCapture={() => selectPatch(patch.id)}
    >
      <ScrubInput
        aria-label="Source X"
        label="X"
        value={Math.round(destinationX + patch.offset[0])}
        min={0}
        max={limit[0]}
        variant="text"
        onChange={(x) =>
          setHealSource(document, layer, patch.id, [
            Math.round(x - destinationX),
            patch.offset[1],
          ])
        }
      />
      <ScrubInput
        aria-label="Source Y"
        label="Y"
        value={Math.round(destinationY + patch.offset[1])}
        min={0}
        max={limit[1]}
        variant="text"
        onChange={(y) =>
          setHealSource(document, layer, patch.id, [
            patch.offset[0],
            Math.round(y - destinationY),
          ])
        }
      />
    </div>
  );
}

/** Shows the ordered repair stack; selection is shared with the canvas and floating bar. */
export function HealControls({
  id,
  patches,
}: {
  id: string;
  patches: readonly HealPatch[];
}) {
  const document = useDocument();
  const { selectedPatch, selectPatch, hoverPatch } = useHealing();
  const source = document.resources.get(
    document.scene.getState().layers[0].source,
  );
  if (!patches.length) {
    return (
      <p className="p-4 text-center text-neutral-500">
        Paint over a spot or object to create the first patch.
      </p>
    );
  }
  return (
    <ol aria-label="Healing patches">
      {patches.map((patch, index) => (
        <li key={patch.id}>
          <PanelListItem
            selected={selectedPatch === patch.id}
            className="pr-1"
            onPointerEnter={() => hoverPatch(patch.id)}
            onPointerLeave={() => hoverPatch()}
          >
            <button
              type="button"
              aria-label={`Select patch ${index + 1}`}
              aria-pressed={selectedPatch === patch.id}
              onClick={() => selectPatch(patch.id)}
              className="flex min-w-0 flex-1 items-center gap-2 self-stretch px-2 text-left"
            >
              <PatchThumbnail stroke={patch.stroke} feather={patch.feather} />
              <span className="min-w-0 flex-1 truncate">Patch {index + 1}</span>
            </button>
            {patch.algorithm === "healing" ? (
              <SourceFields
                layer={id}
                patch={patch}
                limit={source.image.size}
              />
            ) : (
              <span className="shrink-0 text-neutral-500">AI</span>
            )}
            <PatchActions
              layer={id}
              patch={patch}
              next={patches[index - 1]?.id ?? patches[index + 1]?.id}
            />
          </PanelListItem>
        </li>
      ))}
    </ol>
  );
}
