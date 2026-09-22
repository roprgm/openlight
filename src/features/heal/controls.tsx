import { CoverageThumbnail } from "@/components/editor/coverage-thumbnail";
import { useDocument } from "@/components/editor/session";
import { HealIcon } from "@/components/icons/heal";
import { Icon } from "@/components/icons/icon";
import { Menu } from "@/components/ui/menu";
import { PanelListItem } from "@/components/ui/panel-list";
import { ScrubInput } from "@/components/ui/scrub-input";
import type { HealPatch } from "@/core/document";
import { deleteHealPatch, duplicateHealPatch, setHealSource } from "./edits";
import { useHealing } from "./mode";
import { patchThumbnailRegion } from "./model";

/** A patch still finding its donor has no raster yet. */
function PendingThumbnail() {
  return (
    <span
      role="img"
      aria-label="Patch pending"
      className="grid size-8 shrink-0 place-items-center rounded-sm border border-neutral-600 bg-neutral-950 text-neutral-500"
    >
      <HealIcon className="size-4" />
    </span>
  );
}

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
  patch: HealPatch;
  limit: readonly [number, number];
}) {
  const document = useDocument();
  const { selectPatch } = useHealing();
  const destination = patch.stroke.points[0];
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onPointerDownCapture={() => selectPatch(patch.id)}
    >
      {(["X", "Y"] as const).map((axis, index) => (
        <ScrubInput
          key={axis}
          aria-label={`Source ${axis}`}
          label={axis}
          value={Math.round(destination[index] + patch.offset[index])}
          min={0}
          max={limit[index]}
          variant="text"
          onChange={(value) => {
            const offset: [number, number] = [patch.offset[0], patch.offset[1]];
            offset[index] = Math.round(value - destination[index]);
            setHealSource(document, layer, patch.id, offset);
          }}
        />
      ))}
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
              <CoverageThumbnail
                id={`layer/${id}/${patch.id}`}
                version={patch}
                region={patchThumbnailRegion(patch.stroke, source.image.size)}
                label="Patch shape"
                fallback={<PendingThumbnail />}
              />
              <span className="min-w-0 flex-1 truncate">Patch {index + 1}</span>
            </button>
            <SourceFields layer={id} patch={patch} limit={source.image.size} />
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
