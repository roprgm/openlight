import { IconButton } from "@roprgm/ui/icon-button";
import { CloneIcon } from "@/components/icons/clone";
import { HealIcon } from "@/components/icons/heal";
import type { IconProps } from "@/components/icons/icon";
import { RemoveIcon } from "@/components/icons/remove";
import type { HealMode } from "@/core/document";
import { useHealing } from "./mode";
import { healModes } from "./modes";

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
      {healModes.map((entry) => (
        <IconButton
          key={entry.mode}
          label={`${entry.label} · ${entry.description}`}
          aria-label={entry.label}
          shortcut="H"
          aria-pressed={mode === entry.mode}
          className="aria-pressed:bg-control-hover pointer-coarse:size-10"
          onClick={() => selectMode(entry.mode)}
        >
          <PatchModeIcon mode={entry.mode} className="size-5" />
        </IconButton>
      ))}
    </fieldset>
  );
}
