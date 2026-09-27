import { Chip } from "@roprgm/ui/chip";
import { type ReactNode, useState } from "react";
import { DialRow, formatValue } from "@/components/ui/dial";
import type { Parameter } from "./parameter";

/**
 * The mobile layout's controls under the canvas, over the frame's tab bar. It keeps one height for
 * every view, so the canvas keeps its size between them. An inert dock dims its contents.
 */
export function EditorDock({
  inert,
  children,
}: {
  inert?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={inert}
      aria-hidden={inert}
      data-inert={inert}
      className="flex h-48 shrink-0 flex-col border-edge border-t surface-panel *:not-last:shadow-[inset_0_-1px_0_var(--color-edge)] data-[inert=true]:*:opacity-50"
    >
      {children}
    </div>
  );
}

/** A choice among a few views or modes, as flat chips in a pill. */
export function DockChips<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex max-w-full gap-0.5 overflow-fade-x rounded-full bg-field p-0.5"
    >
      {items.map(([id, name]) => (
        // Two names may share a value, as Original and 3:2 do on a 3:2 photo.
        <Chip
          key={name}
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {name}
        </Chip>
      ))}
    </fieldset>
  );
}

function Readout({ parameter }: { parameter: Parameter }) {
  return (
    <p className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-muted">{parameter.label}</span>
      <span className="font-medium text-foreground tabular-nums">
        {formatValue(parameter.value, parameter.step, parameter.format)}
      </span>
    </p>
  );
}

/**
 * A dock view: a centered header, such as chips, with an optional action at its end, over a row of
 * dials or other content. While a dial drags, its name and value take the header's place, above the finger.
 */
export function DockControls({
  header,
  action,
  parameters,
  children,
}: {
  header?: ReactNode;
  action?: ReactNode;
  parameters?: readonly Parameter[];
  children?: ReactNode;
}) {
  const [scrub, setScrub] = useState<string | null>(null);
  const scrubbed = parameters?.find((parameter) => parameter.id === scrub);
  return (
    <section className="flex min-h-0 flex-1 flex-col pb-3">
      <div className="relative flex h-12 shrink-0 items-center justify-center px-3">
        <div className="flex min-w-0 max-w-full justify-center">
          {scrubbed ? <Readout parameter={scrubbed} /> : header}
        </div>
        {action && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            {action}
          </div>
        )}
      </div>
      {parameters ? (
        // A new set of dials starts again from its first page.
        <DialRow
          key={parameters.map((parameter) => parameter.id).join()}
          dials={parameters}
          onScrub={setScrub}
        />
      ) : (
        children
      )}
    </section>
  );
}
