import { cva } from "class-variance-authority";
import {
	type ComponentProps,
	type PointerEvent,
	useRef,
	useState,
} from "react";
import { Field } from "./field";

type ScrubInputProps = Omit<
	ComponentProps<"input">,
	"onChange" | "type" | "value" | "min" | "max" | "step"
> & {
	/** Rendered inline before the field; omit it inside an already-labeled row. */
	label?: string;
	value: number;
	onChange: (value: number) => void;
	min: number;
	max: number;
	step?: number;
	/** "box" always shows the field chrome; "text" reads as plain text until edited. */
	variant?: "box" | "text";
};

const input = cva(
	"w-full cursor-ew-resize bg-transparent text-neutral-100 tabular-nums outline-none focus:cursor-text",
	{
		variants: {
			variant: {
				box: "text-center",
				text: "text-right focus:text-center",
			},
		},
	},
);

type Drag = { dx: number; lastX: number; value: number; moved: boolean };

/** Numeric field that edits on click and scrubs the value on horizontal drag. */
export function ScrubInput({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	variant = "box",
	...props
}: ScrubInputProps) {
	const decimals = `${step}`.split(".")[1]?.length ?? 0;
	const [draft, setDraft] = useState<string>();
	const drag = useRef<Drag | undefined>(undefined);

	const clamp = (next: number) =>
		Math.min(max, Math.max(min, Number(next.toFixed(decimals))));

	const commit = () => {
		if (draft && !Number.isNaN(Number(draft))) onChange(clamp(Number(draft)));
		setDraft(undefined);
	};

	const startScrub = (event: PointerEvent<HTMLInputElement>) => {
		if (document.activeElement === event.currentTarget) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { dx: 0, lastX: event.clientX, value, moved: false };
	};

	const scrub = (event: PointerEvent<HTMLInputElement>) => {
		const state = drag.current;
		if (!state) return;
		// Under pointer lock clientX freezes, so deltas come from movementX.
		const locked = document.pointerLockElement === event.currentTarget;
		state.dx += locked ? event.movementX : event.clientX - state.lastX;
		state.lastX = event.clientX;
		if (!state.moved && Math.abs(state.dx) > 2) {
			state.moved = true;
			// Lock hides the cursor so the drag is unbounded by screen edges.
			Promise.resolve(event.currentTarget.requestPointerLock()).catch(() => {});
		}
		// Range-based speed so every control sweeps its full range in ~250px.
		if (state.moved)
			onChange(clamp(state.value + (state.dx * (max - min)) / 250));
	};

	const endScrub = (event: PointerEvent<HTMLInputElement>) => {
		const state = drag.current;
		drag.current = undefined;
		if (!state) return;
		if (state.moved) {
			document.exitPointerLock();
			return;
		}
		// A press that never moved is a click: enter text editing.
		event.currentTarget.focus();
		event.currentTarget.select();
	};

	return (
		<label className="flex items-center gap-2 text-neutral-400 text-sm">
			{label}
			<Field className="w-16" variant={variant}>
				<input
					{...props}
					className={input({ variant })}
					inputMode="decimal"
					onBlur={commit}
					onChange={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) =>
						event.key === "Enter" && event.currentTarget.blur()
					}
					onPointerDown={startScrub}
					onPointerMove={scrub}
					onPointerUp={endScrub}
					type="text"
					value={draft ?? value.toFixed(decimals)}
				/>
			</Field>
		</label>
	);
}
