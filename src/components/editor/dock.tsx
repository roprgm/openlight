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
      className="flex h-54 shrink-0 flex-col border-edge border-t surface-panel *:not-last:shadow-[inset_0_-1px_0_var(--color-edge)] data-[inert=true]:*:opacity-50"
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
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-field p-0.5 [scrollbar-width:none]"
    >
      {items.map(([id, name]) => (
        <Chip key={id} aria-pressed={id === value} onClick={() => onChange(id)}>
          {name}
        </Chip>
      ))}
    </fieldset>
  );
}

function Readout({ parameter, fine }: { parameter: Parameter; fine: boolean }) {
  return (
    <p
      aria-live="polite"
      className="flex items-baseline gap-2 whitespace-nowrap"
    >
      <span className="text-muted">{parameter.label}</span>
      <span className="font-medium text-foreground tabular-nums">
        {formatValue(parameter.value, parameter.step, parameter.format)}
      </span>
      <span className="text-faint">
        {fine ? "Fine" : "Slide up for fine control"}
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
  const [scrub, setScrub] = useState<{ id: string; fine: boolean } | null>(
    null,
  );
  const scrubbed = parameters?.find((parameter) => parameter.id === scrub?.id);
  return (
    <section className="flex min-h-0 flex-1 flex-col pb-3">
      <div className="grid h-13 shrink-0 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-3">
        <div className="col-start-2 flex min-w-0 justify-center">
          {scrub && scrubbed ? (
            <Readout parameter={scrubbed} fine={scrub.fine} />
          ) : (
            header
          )}
        </div>
        <div className="flex justify-end">{action}</div>
      </div>
      {parameters ? (
        <DialRow dials={parameters} onScrub={setScrub} />
      ) : (
        children
      )}
    </section>
  );
}
