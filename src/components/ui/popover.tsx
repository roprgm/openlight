import { Popover as Primitive } from "@base-ui/react/popover";
import { type ReactNode, useState } from "react";
import { Chip } from "./chip";
import { Surface } from "./surface";
import { Tooltip } from "./tooltip";

/** A pill that opens settings beside it, such as bar controls that no longer fit. */
export function Popover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Primitive.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={label} disabled={open}>
        <Primitive.Trigger
          aria-label={label}
          render={<Chip className="grid place-items-center px-2" />}
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
