import { IconButton } from "@roprgm/ui/icon-button";
import { cn } from "cn";
import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type DialProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** True while a pointer or key is down on it, so a caller can group its changes into one edit. */
  onEditingChange?: (editing: boolean) => void;
  /** True while a drag moves it, so a caller can show its value away from the finger. */
  onScrub?: (scrubbing: boolean) => void;
  /** A touch that lifts without dragging, such as to pick the dial for typing. */
  onTap?: () => void;
  selected?: boolean;
  min: number;
  max: number;
  step?: number;
  /** Restored by a double tap. */
  defaultValue?: number;
  /** Where the arc starts: `defaultValue`, or else `min`. */
  origin?: number;
  format?: (value: number) => string;
  /** A swatch in the middle names the dial, and the value moves below it. */
  color?: string;
};

const radius = 21;
const circumference = 2 * Math.PI * radius;
/** A drag across this many pixels sweeps the whole range. */
const sweep = 600;
/** How far a finger moves before a touch becomes a drag, so a tap's jitter changes nothing. */
const slop = 6;
const doubleTap = 300;

const keySteps: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};

/** The value as the dial writes it: to the step's decimals, then through `format`. */
export function formatValue(
  value: number,
  step = 1,
  format?: (value: number) => string,
) {
  const fixed = value.toFixed(`${step}`.split(".")[1]?.length ?? 0);
  return format?.(Number(fixed)) ?? fixed;
}

/** The arc from the origin to the value: clockwise from the top for more, the other way for less. */
function Arc({
  value,
  min,
  max,
  origin,
}: {
  value: number;
  min: number;
  max: number;
  origin: number;
}) {
  const centered = origin > min && origin < max;
  const reach = value >= origin ? max - origin : origin - min;
  const fraction = reach ? (value - origin) / reach : 0;
  const length = Math.abs(fraction) * circumference * (centered ? 0.5 : 1);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="absolute inset-0 size-full fill-none stroke-[2.5]"
    >
      <circle className="stroke-hover" cx="24" cy="24" r={radius} />
      {length > 0.1 && (
        <circle
          className="stroke-muted group-data-[scrubbing=true]:stroke-foreground group-data-[selected=true]:stroke-foreground"
          cx="24"
          cy="24"
          r={radius}
          strokeLinecap="round"
          strokeDasharray={`${length} ${circumference}`}
          transform={`${fraction < 0 ? "scale(-1 1) translate(-48 0)" : ""} rotate(-90 24 24)`}
        />
      )}
    </svg>
  );
}

/**
 * A number set by dragging anywhere on it, for touch: right or up adds, left or down takes away.
 * A double tap restores the default, and the arrow keys step it.
 */
export function Dial({
  label,
  value,
  onChange,
  onEditingChange,
  onScrub,
  onTap,
  selected,
  min,
  max,
  step = 1,
  defaultValue,
  origin = defaultValue ?? min,
  format,
  color,
}: DialProps) {
  const drag = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    value: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef(Number.NEGATIVE_INFINITY);
  const [scrubbing, setScrubbing] = useState(false);
  const decimals = `${step}`.split(".")[1]?.length ?? 0;
  const snap = (next: number) =>
    Math.min(
      max,
      Math.max(min, Number((Math.round(next / step) * step).toFixed(decimals))),
    );
  const text = formatValue(value, step, format);
  const edited = defaultValue !== undefined && value !== defaultValue;

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    onEditingChange?.(true);
    if (event.timeStamp - lastTap.current < doubleTap) {
      lastTap.current = Number.NEGATIVE_INFINITY;
      if (defaultValue !== undefined) {
        onChange(defaultValue);
      }
      return;
    }
    lastTap.current = event.timeStamp;
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      value,
      moved: false,
    };
    setScrubbing(true);
    onScrub?.(true);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) {
      return;
    }
    current.moved ||=
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) > slop;
    if (!current.moved) {
      return;
    }
    const distance = event.clientX - current.x + current.y - event.clientY;
    current.x = event.clientX;
    current.y = event.clientY;
    current.value = Math.min(
      max,
      Math.max(min, current.value + (distance * (max - min)) / sweep),
    );
    const next = snap(current.value);
    if (next !== value) {
      onChange(next);
    }
  }
  function end(lifted: boolean) {
    const tapped = lifted && drag.current !== null && !drag.current.moved;
    // A drag is not the first tap of a double tap.
    if (drag.current?.moved) {
      lastTap.current = Number.NEGATIVE_INFINITY;
    }
    drag.current = null;
    setScrubbing(false);
    onScrub?.(false);
    onEditingChange?.(false);
    if (tapped) {
      onTap?.();
    }
  }
  function keyDown(event: KeyboardEvent) {
    const steps = keySteps[event.key];
    const next =
      event.key === "Home" ? min : event.key === "End" ? max : undefined;
    if (steps === undefined && next === undefined) {
      return;
    }
    event.preventDefault();
    onEditingChange?.(true);
    onChange(next ?? snap(value + steps * step * (event.shiftKey ? 10 : 1)));
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      data-scrubbing={scrubbing}
      data-selected={Boolean(selected)}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onKeyDown={keyDown}
      onKeyUp={() => onEditingChange?.(false)}
      onBlur={() => onEditingChange?.(false)}
      className="group flex cursor-move touch-none flex-col items-center gap-1.5 rounded-md select-none focus-ring"
    >
      <span
        className={cn(
          "relative grid place-items-center rounded-full surface-sunken tabular-nums transition group-data-[scrubbing=true]:scale-108",
          color ? "size-9" : "size-11.5",
          edited ? "text-foreground" : "text-faint",
        )}
      >
        <Arc value={value} min={min} max={max} origin={origin} />
        {color ? (
          <span
            className="size-4 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : (
          text
        )}
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-muted group-data-[scrubbing=true]:text-foreground group-data-[selected=true]:text-foreground",
          color && "tabular-nums",
        )}
      >
        {color ? text : label}
      </span>
    </div>
  );
}

/**
 * Room each dial keeps beyond its circle or label, the most of a row's spare width each takes on, and
 * the fraction of a dial that peeks in when paged.
 */
const gaps = { dial: 12, swatch: 8 };
const maxShare = 28;
const peek = 0.4;
const padding = 8;

type RowLayout =
  | { width: number; paged: false; widths: number[] }
  | { width: number; paged: true; slot: number; perPage: number };

/** A dial as a row holds it: the row wires the scrub, the tap, and the selection. */
export type DialItem = Omit<DialProps, "onScrub" | "onTap" | "selected"> & {
  id: string;
};

/**
 * Dials in one row that never scrolls under a finger, so a drag on a dial always moves its value.
 * Each takes its natural width plus a gap and a share of what is left, up to a limit, and the row
 * centers what it doesn't fill. When they don't fit they page, with the next one peeking in under
 * an arrow. Swatch dials sit closer.
 */
export function DialRow({
  dials,
  onScrub,
  selected,
  onTap,
}: {
  dials: readonly DialItem[];
  /** The dial a drag is moving, or null. */
  onScrub?: (id: string | null) => void;
  selected?: string;
  onTap?: (id: string) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLDivElement>());
  const [layout, setLayout] = useState<RowLayout | null>(null);
  const [page, setPage] = useState(0);
  const gap = dials.some((dial) => dial.color) ? gaps.swatch : gaps.dial;
  const ids = dials.map((dial) => dial.id).join();
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) {
      return;
    }
    const order = ids.split(",");
    function measure(width: number) {
      const natural = order.map(
        (id) =>
          (cells.current.get(id)?.firstElementChild?.clientWidth ?? 0) + gap,
      );
      const inner = width - padding * 2;
      const total = natural.reduce((sum, next) => sum + next, 0);
      if (total <= inner) {
        const share = Math.min(maxShare, (inner - total) / order.length);
        setLayout({
          width,
          paged: false,
          widths: natural.map((w) => w + share),
        });
        return;
      }
      const perPage = Math.max(
        1,
        Math.floor(width / Math.max(...natural) - peek),
      );
      setLayout({
        width,
        paged: true,
        perPage,
        slot: width / (perPage + peek),
      });
    }
    measure(element.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ids, gap]);

  const count = dials.length;
  const pages = layout?.paged
    ? Math.ceil((count - layout.perPage) / layout.perPage) + 1
    : 1;
  const current = Math.min(page, pages - 1);
  const before = Boolean(layout?.paged) && current > 0;
  const after = Boolean(layout?.paged) && current < pages - 1;
  let shift = 0;
  let fade = 0;
  if (layout?.paged) {
    fade = layout.slot * peek;
    if (current === pages - 1) {
      shift = count * layout.slot - layout.width;
    } else if (current > 0) {
      shift = (current * layout.perPage - peek) * layout.slot;
    }
  }
  const mask = [
    before ? `transparent, #000 ${fade}px` : "#000",
    after ? `#000 calc(100% - ${fade}px), transparent` : "#000",
  ].join(", ");
  function width(index: number) {
    if (!layout) {
      return undefined;
    }
    return layout.paged ? layout.slot : layout.widths[index];
  }

  return (
    <div className="relative flex min-h-0 flex-1 items-center">
      <div
        ref={row}
        className="h-full w-full overflow-hidden"
        style={{ maskImage: `linear-gradient(to right, ${mask})` }}
      >
        <div
          className={cn(
            "flex h-full transition-transform duration-300",
            !layout?.paged && "justify-center px-2",
          )}
          style={{ transform: `translateX(${-shift}px)` }}
        >
          {dials.map(({ id, ...dial }, index) => (
            <div
              key={id}
              ref={(cell) => {
                if (cell) {
                  cells.current.set(id, cell);
                } else {
                  cells.current.delete(id);
                }
              }}
              className="flex shrink-0 items-center justify-center"
              style={{ width: width(index) }}
            >
              <Dial
                {...dial}
                selected={id === selected}
                onScrub={(scrubbing) => onScrub?.(scrubbing ? id : null)}
                onTap={() => onTap?.(id)}
              />
            </div>
          ))}
        </div>
      </div>
      {before && (
        <IconButton
          label="Previous controls"
          className="absolute left-0"
          onClick={() => setPage(current - 1)}
        >
          <Chevron flip />
        </IconButton>
      )}
      {after && (
        <IconButton
          label="More controls"
          className="absolute right-0"
          onClick={() => setPage(current + 1)}
        >
          <Chevron />
        </IconButton>
      )}
    </div>
  );
}

function Chevron({ flip }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn(
        "size-4 fill-none stroke-current stroke-2",
        flip && "-scale-x-100",
      )}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
