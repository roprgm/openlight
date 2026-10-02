import type { HealMode } from "@/core/document";

/** Display order, initial mode, and shortcut cycle share the same choices. */
export const healModes = [
  {
    mode: "remove",
    label: "Remove",
    description: "Synthesize texture from surrounding context",
  },
  {
    mode: "heal",
    label: "Heal",
    description: "Copy texture and match surrounding color",
  },
  {
    mode: "clone",
    label: "Clone",
    description: "Copy the source without color correction",
  },
] as const;

export function nextHealMode(mode: HealMode): HealMode {
  const index = healModes.findIndex((entry) => entry.mode === mode);
  return healModes[(index + 1) % healModes.length].mode;
}
