import type { ReactNode } from "react";
import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import type { EditorDocument } from "@/lib/editor/document";

const controls = [
	{
		name: "temperature",
		label: "Temperature (K)",
		min: 1000,
		max: 15000,
		stops: ["#4a6fc3", "#c3b84a"],
	},
	{
		name: "tint",
		label: "Tint",
		min: -150,
		max: 150,
		stops: ["#5ab34a", "#b34ab3"],
	},
];

export function setWhiteBalance(
	document: EditorDocument,
	change: Record<string, number>,
) {
	const scene = document.scene.getState();
	if (!document.resources.get(scene.source).development) {
		throw Error("This image has no editable RAW white balance.");
	}
	for (const [name, value] of Object.entries(change)) {
		const control = controls.find((c) => c.name === name);
		if (
			!control ||
			!Number.isFinite(value) ||
			value < control.min ||
			value > control.max
		) {
			throw Error(`Invalid white balance: ${name}.`);
		}
	}
	document.edit({
		...scene,
		sourceSettings: { ...scene.sourceSettings, ...change },
	});
}

export function RawControls({ children }: { children: ReactNode }) {
	const document = useDocument();
	const source = useScene((scene) => scene.source);
	const settings = useScene((scene) => scene.sourceSettings);
	const development = document.resources.get(source).development;
	if (!development || !settings) {
		return children;
	}
	return (
		<>
			<button
				type="button"
				className="self-start text-xs text-neutral-400 hover:text-neutral-100"
				onClick={() => setWhiteBalance(document, development.defaults)}
			>
				As Shot
			</button>
			{controls.map(({ name, ...props }) => (
				<Slider
					key={name}
					{...props}
					value={settings[name]}
					defaultValue={development.defaults[name]}
					onChange={(value) => setWhiteBalance(document, { [name]: value })}
				/>
			))}
		</>
	);
}
