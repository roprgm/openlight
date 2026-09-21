import { cva } from "class-variance-authority";
import { cn } from "cn";
import { Icon } from "@/components/icons/icon";
import { MenuSurface } from "./menu-surface";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SelectProps<T extends string> = {
  "aria-label": string;
  value?: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  /** "field" sits in a panel; "pill" sits in the bar over the canvas. */
  variant?: "field" | "pill";
};

const control = cva(
  "inline-flex min-w-0 shrink-0 cursor-pointer items-center justify-between gap-2 text-neutral-200 outline-none focus-visible:ring-1 focus-visible:ring-white/20",
  {
    variants: {
      variant: {
        field:
          "rounded border border-black bg-neutral-900 py-0.5 pr-2 pl-1 shadow-groove",
        pill: "h-7 rounded-full bg-white/10 px-3 hover:bg-white/15 pointer-coarse:h-9",
      },
    },
  },
);

/** A value selector using the same elevated option surface as row and toolbar menus. */
export function Select<T extends string>({
  "aria-label": label,
  value,
  options,
  onChange,
  placeholder,
  title,
  className,
  variant = "field",
}: SelectProps<T>) {
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  return (
    <MenuSurface
      role="listbox"
      trigger={(id, open) => (
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-controls={id}
          aria-expanded={open}
          aria-haspopup="listbox"
          title={title}
          popoverTarget={id}
          className={cn(control({ variant }), className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <Icon className="size-3 shrink-0 text-neutral-400">
            <path d="m6 9 6 6 6-6" />
          </Icon>
        </button>
      )}
    >
      {options.map((option, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={`${option.value}-${index}`}
            type="submit"
            role="option"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className="flex items-center justify-between gap-4 aria-selected:bg-neutral-700"
          >
            {option.label}
            {active && (
              <Icon className="size-3.5 shrink-0 text-neutral-300">
                <path d="m5 12 4 4L19 6" />
              </Icon>
            )}
          </button>
        );
      })}
    </MenuSurface>
  );
}
