import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { CurvePoint, ToneCurve } from "@/core/document";
import { clamp } from "@/lib/math";
import {
  insertCurvePoint,
  moveCurvePoint,
  removeCurvePoint,
  sampleCurve,
} from "./curve";

function gridLines(divisions: number, [width, height]: readonly number[]) {
  return Array.from({ length: divisions - 1 }, (_, index) => {
    const x = ((index + 1) * width) / divisions;
    const y = ((index + 1) * height) / divisions;
    return `M${x} 0V${height} M0 ${y}H${width}`;
  }).join(" ");
}

/** The graph draws in pixels so lines and points keep their weight at any box aspect. */
function useBoxSize(ref: React.RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState<readonly [number, number]>([256, 256]);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize([width, height]);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function position(event: MouseEvent<SVGSVGElement>): CurvePoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp(1 - (event.clientY - bounds.top) / bounds.height),
  };
}

type GraphProps = {
  points: ToneCurve;
  onChange: (points: ToneCurve) => void;
};

export function Graph({ points, onChange }: GraphProps) {
  const [selected, select] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [width, height] = useBoxSize(svg);
  const line = Array.from(
    sampleCurve(points, 257),
    (y, x) => `${(x / 256) * width},${height * (1 - y)}`,
  ).join(" ");
  function move(index: number, point: CurvePoint) {
    onChange(moveCurvePoint(points, index, point));
  }
  function remove(index: number) {
    const curve = removeCurvePoint(points, index);
    if (curve !== points) {
      onChange(curve);
      select(null);
    }
  }
  function hitTest(event: MouseEvent<SVGSVGElement>) {
    const point = position(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    return points.findIndex(
      (candidate) =>
        Math.hypot(
          (candidate.x - point.x) * bounds.width,
          (candidate.y - point.y) * bounds.height,
        ) <= 12,
    );
  }
  function doubleClick(event: MouseEvent<SVGSVGElement>) {
    const index = hitTest(event);
    if (index === 0) {
      move(index, { x: 0, y: 0 });
    } else if (index === points.length - 1) {
      move(index, { x: 1, y: 1 });
    } else {
      remove(index);
    }
  }
  function insert(point?: CurvePoint) {
    const inserted = insertCurvePoint(points, point);
    if (!inserted) {
      return null;
    }
    onChange(inserted.curve);
    select(inserted.index);
    return inserted.index;
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    const point = position(event);
    let index = hitTest(event);
    if (index < 0) {
      const added = insert(point);
      if (added === null) {
        return;
      }
      index = added;
    }
    select(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function keyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      insert();
      return;
    }
    if (selected === null || !points[selected]) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(selected);
      return;
    }
    const directions: Record<string, CurvePoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowDown: { x: 0, y: -1 },
      ArrowUp: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      const step = event.shiftKey ? 0.01 : 0.001;
      move(selected, {
        x: points[selected].x + direction.x * step,
        y: points[selected].y + direction.y * step,
      });
    }
  }
  return (
    <svg
      aria-label="Tone curve"
      aria-description="Click or press Enter to add a point. Drag or use arrow keys to move it. Endpoints follow the edges. Shift moves faster. Double-click resets an endpoint or removes an interior point. Delete removes an interior point."
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none overflow-visible outline-none"
      onDoubleClick={doubleClick}
      onKeyDown={keyDown}
      onPointerDown={start}
      onPointerMove={(event) => {
        if (
          selected !== null &&
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          move(selected, position(event));
        }
      }}
      ref={svg}
      role="application"
      tabIndex={-1}
    >
      <path
        d={gridLines(32, [width, height])}
        fill="none"
        stroke="white"
        strokeOpacity="0.04"
      />
      <path
        d={gridLines(8, [width, height])}
        fill="none"
        stroke="white"
        strokeOpacity="0.07"
      />
      <path
        d={`M0 ${height}L${width} 0`}
        fill="none"
        stroke="#a3a3a3"
        strokeDasharray="3 4"
        strokeOpacity="0.2"
      />
      <polyline
        className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]"
        fill="none"
        points={line}
        stroke="#e5e5e5"
        strokeWidth="2"
      />
      {points.map((point, index) => (
        <circle
          className="fill-neutral-800 stroke-neutral-200 data-[selected=true]:fill-neutral-100"
          cx={point.x * width}
          cy={(1 - point.y) * height}
          data-selected={selected === index}
          key={point.x}
          r="4"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}
