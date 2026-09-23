import { CoverageThumbnail } from "@/components/editor/coverage-thumbnail";
import { useDocument } from "@/components/editor/session";
import { HealIcon } from "@/components/icons/heal";
import { Icon } from "@/components/icons/icon";
import { Menu, MenuItem } from "@/components/ui/menu";
import { PanelListItem } from "@/components/ui/panel-list";
import type { HealPatch } from "@/core/document";
import { deleteHealPatch, duplicateHealPatch } from "./edits";
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
      <MenuItem
        onClick={() =>
          selectPatch(duplicateHealPatch(document, layer, patch.id))
        }
      >
        Duplicate
      </MenuItem>
      <MenuItem
        onClick={() => {
          deleteHealPatch(document, layer, patch.id);
          selectPatch(next);
        }}
      >
        Delete
      </MenuItem>
    </Menu>
  );
}

/** The brush size, and the opacity once lowered; the donor is edited on the canvas. */
function patchSummary(patch: HealPatch) {
  const size = `${Math.round(patch.stroke.size)} px`;
  return patch.opacity < 1
    ? `${size} · ${Math.round(patch.opacity * 100)}%`
    : size;
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
              <span className="shrink-0 text-neutral-500 tabular-nums">
                {patchSummary(patch)}
              </span>
            </button>
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
