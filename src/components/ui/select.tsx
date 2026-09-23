import { Select as Primitive } from "@base-ui/react/select";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { useState } from "react";
import { Icon } from "@/components/icons/icon";
import { Surface } from "./surface";
import { Tooltip } from "./tooltip";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

const trigger = cva(
  "inline-flex min-w-0 shrink-0 cursor-pointer items-center justify-between gap-2 text-neutral-200 outline-none focus-visible:ring-1 focus-visible:ring-white/20",
  {
    variants: {
      /** "field" sits in a panel; "pill" sits in the bar over the canvas. */
      variant: {
        field:
          "rounded border border-black bg-neutral-900 py-0.5 pr-2 pl-1 shadow-groove",
        pill: "h-7 rounded-full bg-white/10 px-3 hover:bg-white/15 data-popup-open:bg-white/15 pointer-coarse:h-9",
      },
    },
  },
);

/** A value chosen from a list on the shared surface, with the selected option checked. */
export function Select<T extends string>({
  "aria-label": label,
  value,
  options,
  onChange,
  placeholder,
  tooltip,
  className,
  variant = "field",
}: {
  "aria-label": string;
  value?: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  tooltip?: string;
  className?: string;
  variant?: "field" | "pill";
}) {
  const [open, setOpen] = useState(false);
  const control = (
    <Primitive.Trigger
      aria-label={label}
      className={cn(trigger({ variant }), className)}
    >
      <Primitive.Value placeholder={placeholder} className="truncate" />
      <Icon className="size-3 shrink-0 text-neutral-400">
        <path d="m6 9 6 6 6-6" />
      </Icon>
    </Primitive.Trigger>
  );
  return (
    <Primitive.Root
      items={options}
      value={value ?? null}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) {
          onChange(option.value);
        }
      }}
    >
      {tooltip ? (
        <Tooltip content={tooltip} disabled={open}>
          {control}
        </Tooltip>
      ) : (
        control
      )}
      <Primitive.Portal>
        <Primitive.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50"
        >
          <Primitive.Popup
            render={(props) => <Surface {...props} />}
            className="min-w-(--anchor-width)"
          >
            <Primitive.List>
              {options.map((option, index) => (
                <Primitive.Item
                  key={`${option.value}-${index}`}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-default items-center justify-between gap-4 rounded-md px-2.5 py-1.5 outline-none select-none data-disabled:text-neutral-600 data-highlighted:bg-white/8 data-selected:bg-neutral-700"
                >
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator>
                    <Icon className="size-3.5 shrink-0 text-neutral-300">
                      <path d="m5 12 4 4L19 6" />
                    </Icon>
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.List>
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
