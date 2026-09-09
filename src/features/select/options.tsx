import { useStore } from "zustand";
import Button from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { defaultOptions } from "./cost";
import type { Selection } from "./session";

export function SelectionOptions({
	selection,
	onApply,
}: {
	selection: Selection;
	onApply: () => void;
}) {
	const { options, status, count, error } = useStore(selection.state);
	const busy = status === "preparing" || status === "growing";
	const messages = {
		idle: "Click the photo to select.",
		preparing: "Preparing image…",
		ready: "Click the photo to select.",
		preview: "Drag to increase tolerance.",
		growing: "Finishing selection…",
		error: error ?? "Selection failed.",
	};
	return (
		<section
			aria-label="Magic Wand tool"
			className="flex h-full flex-col bg-panel"
		>
			<div className="flex-1 space-y-5 overflow-y-auto p-4">
				<h2 className="text-sm text-neutral-100">Magic Wand</h2>
				<Slider
					label="Tolerance"
					min={0.01}
					max={2}
					step={0.01}
					value={options.tolerance}
					defaultValue={defaultOptions.tolerance}
					onChange={(tolerance) => selection.configure({ tolerance })}
				/>
				<label className="flex items-center justify-between text-sm text-neutral-400">
					Contiguous
					<input
						type="checkbox"
						checked={options.contiguous}
						onChange={(event) =>
							selection.configure({ contiguous: event.currentTarget.checked })
						}
					/>
				</label>
				<label className="flex items-center justify-between text-sm text-neutral-400">
					Sample size
					<select
						className="rounded bg-neutral-800 p-1 text-neutral-100 [color-scheme:dark]"
						value={options.sampleSize}
						onChange={(event) => {
							const value = Number(event.currentTarget.value);
							if (value === 1 || value === 3 || value === 5)
								selection.configure({ sampleSize: value });
						}}
					>
						<option value={1}>1 × 1</option>
						<option value={3}>3 × 3</option>
						<option value={5}>5 × 5</option>
					</select>
				</label>
				<Slider
					label="Feather"
					min={0}
					max={20}
					step={0.5}
					value={options.feather}
					defaultValue={defaultOptions.feather}
					onChange={(feather) => selection.configure({ feather })}
				/>
				<p className="text-xs text-neutral-500">
					Click to seed; drag to increase tolerance. Shift adds, Alt subtracts,
					Ctrl/⌘ intersects. Space + drag pans.
				</p>
				<p className="text-xs text-neutral-500">
					Samples the edited photo. Escape cancels a grow or deselects. Enter
					keeps the selection.
				</p>
				<p role="status" className="text-xs text-neutral-400">
					{messages[status]}
				</p>
				<p className="text-xs tabular-nums text-neutral-400">
					{count.toLocaleString()} pixels selected
				</p>
			</div>
			<div className="flex justify-end gap-2 border-t border-black p-3">
				<Button variant="ghost" onClick={selection.clear}>
					Deselect
				</Button>
				<Button variant="ghost" onClick={selection.close}>
					Close
				</Button>
				<Button disabled={busy} onClick={onApply}>
					Apply
				</Button>
			</div>
		</section>
	);
}
