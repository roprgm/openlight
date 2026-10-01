import { IconButton } from "@roprgm/ui/icon-button";
import { CloneIcon } from "@/components/icons/clone";
import { HealIcon } from "@/components/icons/heal";
import type { IconProps } from "@/components/icons/icon";
import { RemoveIcon } from "@/components/icons/remove";
import type { HealMode } from "@/core/document";
import { useHealing } from "./mode";

export function PatchModeIcon({
  mode,
  ...props
}: IconProps & { mode: HealMode }) {
  if (mode === "clone") return <CloneIcon {...props} />;
  if (mode === "remove") return <RemoveIcon {...props} />;
  return <HealIcon {...props} />;
}

export function HealModeIcon(props: IconProps) {
  const { mode } = useHealing();
  return <PatchModeIcon {...props} mode={mode} />;
}

export function HealModeButtons() {
  const { mode, selectMode } = useHealing();
  return (
    <fieldset aria-label="Retouch mode" className="mr-1 flex gap-0.5">
      <IconButton
        label="Heal · Copy texture and match surrounding color"
        aria-label="Heal"
        shortcut="H"
        aria-pressed={mode === "heal"}
        className="aria-pressed:bg-raised-hover pointer-coarse:size-10"
        onClick={() => selectMode("heal")}
      >
        <HealIcon className="size-5" />
      </IconButton>
      <IconButton
        label="Clone · Copy the source without color correction"
        aria-label="Clone"
        shortcut="H"
        aria-pressed={mode === "clone"}
        className="aria-pressed:bg-raised-hover pointer-coarse:size-10"
        onClick={() => selectMode("clone")}
      >
        <CloneIcon className="size-5" />
      </IconButton>
      <IconButton
        label="Remove · Synthesize texture from surrounding context"
        aria-label="Remove"
        shortcut="H"
        aria-pressed={mode === "remove"}
        className="aria-pressed:bg-raised-hover pointer-coarse:size-10"
        onClick={() => selectMode("remove")}
      >
        <RemoveIcon className="size-5" />
      </IconButton>
    </fieldset>
  );
}
