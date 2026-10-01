import { Button } from "@roprgm/ui/button";
import { Chip } from "@roprgm/ui/chip";
import { ScrubInput } from "@roprgm/ui/scrub-input";
import { cn } from "cn";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DialRow, formatValue } from "@/components/ui/dial";
import type { Parameter } from "./parameter";

/** Whether the dock is inert, as before a document opens, so its views teach nothing. */
const Inert = createContext(false);

/**
 * The mobile layout's controls under the canvas, over the frame's tab bar. It takes its view's height,
 * up to half the editor, where a view that holds more scrolls. An inert dock dims its contents.
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
      className="flex max-h-1/2 shrink-0 flex-col border-edge border-t surface-panel *:not-last:shadow-[inset_0_-1px_0_var(--color-edge)] data-[inert=true]:*:opacity-50"
    >
      <Inert value={Boolean(inert)}>{children}</Inert>
    </div>
  );
}

/** A choice among a few views or modes, as flat chips in a pill that scrolls to the one chosen. */
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
  const chosen = useRef<HTMLButtonElement>(null);
  // Each new value brings its chip into view, once the ref points at it.
  useEffect(() => {
    chosen.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);
  return (
    <fieldset
      aria-label={label}
      className="flex max-w-full gap-0.5 overflow-fade-x rounded-full bg-field p-0.5"
    >
      {items.map(([id, name]) => (
        <Chip
          key={id}
          ref={id === value ? chosen : undefined}
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

/** A tapped dial's name and value, which a tap on the value types into. */
function Picked({ parameter }: { parameter: Parameter }) {
  return (
    <p className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-muted">{parameter.label}</span>
      <ScrubInput
        {...parameter}
        aria-label={parameter.label}
        className="font-medium text-foreground"
      />
    </p>
  );
}

const hintKey = "openlight:dial-hint";
/** Seen for this visit even where storage is unavailable, so the hint shows once per visit at most. */
let hintSeen = false;

function readHintSeen() {
  try {
    hintSeen ||= localStorage.getItem(hintKey) === "seen";
  } catch {
    // Without storage the hint shows again next visit.
  }
  return hintSeen;
}

function markHintSeen() {
  hintSeen = true;
  try {
    localStorage.setItem(hintKey, "seen");
  } catch {
    // Without storage the hint shows again next visit.
  }
}

/**
 * A dock view: a centered header, such as chips, with an optional action at its end, over a row of
 * dials or other content. While a dial drags, its name and value take the header's place, above the
 * finger; a tapped dial keeps them there to type into, until Done. Until someone first moves a dial,
 * a hint floats above the dock. Dials keep the dock low; `tall` raises it for a graph such as the curve.
 */
export function DockControls({
  header,
  action,
  parameters,
  tall,
  children,
}: {
  header?: ReactNode;
  action?: ReactNode;
  parameters?: readonly Parameter[];
  tall?: boolean;
  children?: ReactNode;
}) {
  const [scrub, setScrub] = useState<string | null>(null);
  const ids = parameters?.map((parameter) => parameter.id).join();
  // A pick belongs to one set of dials, so switching groups lets it go.
  const [pick, setPick] = useState<{ ids?: string; id: string } | null>(null);
  const inert = useContext(Inert);
  const [hint, setHint] = useState(
    () => !inert && Boolean(parameters) && !readHintSeen(),
  );
  const find = (id?: string | null) =>
    parameters?.find((parameter) => parameter.id === id);
  const scrubbed = find(scrub);
  const picked = pick?.ids === ids ? find(pick?.id) : undefined;
  function learned() {
    setHint(false);
    markHintSeen();
  }
  let top = header;
  if (scrubbed) {
    top = <Readout parameter={scrubbed} />;
  } else if (picked) {
    top = <Picked parameter={picked} />;
  }
  return (
    <section
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col pb-3 transition-[height] duration-200 ease-out motion-reduce:transition-none",
        tall ? "h-60" : parameters && "h-36",
      )}
    >
      {hint && (
        // Above the histogram and zoom control, which sit in the canvas's bottom corners.
        <p className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-21 w-72 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md bg-level-4/80 px-3 py-1.5 text-center text-balance text-muted backdrop-blur-sm">
          Drag a dial to change it, double{"\u2011"}tap to reset, tap to type a
          value
        </p>
      )}
      <div className="relative flex h-12 shrink-0 items-center justify-center px-3">
        <div className="flex min-w-0 max-w-full justify-center">{top}</div>
        {(picked || action) && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            {picked ? (
              <Button variant="ghost" size="sm" onClick={() => setPick(null)}>
                Done
              </Button>
            ) : (
              action
            )}
          </div>
        )}
      </div>
      {parameters ? (
        // A new set of dials starts again from its first page.
        <DialRow
          key={ids}
          dials={parameters}
          selected={picked?.id}
          onScrub={(id) => {
            setScrub(id);
            if (id) learned();
          }}
          onTap={(id) => {
            learned();
            setPick(picked?.id === id ? null : { ids, id });
          }}
        />
      ) : (
        children
      )}
    </section>
  );
}
