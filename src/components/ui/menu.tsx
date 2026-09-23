import { Menu as Primitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { type ComponentProps, type ReactNode, useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Button } from "./button";
import { Chip } from "./chip";
import { Surface } from "./surface";
import { Tooltip } from "./tooltip";

/**
 * A button that opens a list of commands. The label names the button and shows as its tooltip.
 * Items mount only while the menu is open. For settings, use a Popover.
 */
export function Menu({
  label,
  icon,
  variant = "row",
  children,
}: {
  label: string;
  icon: ReactNode;
  /** "row" sits in a panel row; "pill" sits in the bar over the canvas. */
  variant?: "row" | "pill";
  children: ReactNode;
}) {
  // The tooltip steps aside while the menu is open, so Escape closes the menu.
  const [open, setOpen] = useState(false);
  return (
    <Primitive.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={label} disabled={open}>
        <Primitive.Trigger
          aria-label={label}
          render={
            variant === "pill" ? (
              <Chip className="grid place-items-center px-2" />
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="pointer-coarse:size-10"
              />
            )
          }
        >
          {icon}
        </Primitive.Trigger>
      </Tooltip>
      <Primitive.Portal>
        <Primitive.Positioner sideOffset={4} align="end" className="z-50">
          <Primitive.Popup render={(props) => <Surface {...props} />}>
            {children}
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}

export function MenuItem({
  className,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 outline-none select-none data-disabled:text-neutral-600 data-highlighted:bg-white/8",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <Primitive.Separator className="mx-1 my-1 h-px bg-white/10" />;
}

/** An item that opens a nested list of commands beside the menu. */
export function Submenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Primitive.SubmenuRoot>
      <Primitive.SubmenuTrigger className="flex cursor-default items-center justify-between gap-4 rounded-md px-2.5 py-1.5 outline-none select-none data-highlighted:bg-white/8 data-popup-open:bg-white/8">
        {label}
        <Icon className="size-3 text-neutral-400">
          <path d="m9 5 7 7-7 7" />
        </Icon>
      </Primitive.SubmenuTrigger>
      <Primitive.Portal>
        <Primitive.Positioner sideOffset={4} alignOffset={-4} className="z-50">
          <Primitive.Popup render={(props) => <Surface {...props} />}>
            {children}
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.SubmenuRoot>
  );
}
