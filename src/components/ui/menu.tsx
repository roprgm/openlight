import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { MenuSurface } from "./menu-surface";

const trigger = cva(
  "grid shrink-0 place-items-center text-neutral-400 hover:text-neutral-100",
  {
    variants: {
      variant: {
        row: "size-7 rounded-md hover:bg-white/8 pointer-coarse:size-10",
        pill: "h-7 rounded-full px-2.5 hover:bg-white/10 pointer-coarse:h-9",
      },
    },
  },
);

/**
 * A button that floats a menu below itself. Submit buttons inside close it; other controls keep it open,
 * so it can hold settings as well as commands. Its children mount only while it is open.
 */
export function Menu({
  label,
  children,
  icon,
  variant = "row",
}: {
  label: string;
  children: ReactNode;
  icon: ReactNode;
  variant?: "row" | "pill";
}) {
  return (
    <MenuSurface
      trigger={(id, open) => (
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={id}
          title={label}
          popoverTarget={id}
          className={trigger({ variant })}
        >
          {icon}
        </button>
      )}
    >
      {children}
    </MenuSurface>
  );
}
