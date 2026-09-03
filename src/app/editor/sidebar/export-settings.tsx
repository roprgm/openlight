import { useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { exportImage } from "@/app/export-image";
import Button from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const formats = [
	{ value: "png", description: "Lossless detail" },
	{ value: "jpeg", description: "Smaller files" },
] as const;

export default function ExportSettings({ onClose }: { onClose: () => void }) {
	const gpu = useGpu();
	const [format, setFormat] = useState<"png" | "jpeg">("png");
	const [quality, setQuality] = useState(90);
	const [error, setError] = useState("");
	const exporting = useRef(false);
	const save = async () => {
		if (exporting.current) {
			return;
		}
		exporting.current = true;
		setError("");
		try {
			const options = format === "png" ? { format } : { format, quality };
			const file = await exportImage(gpu, options);
			const url = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = url;
			link.download = file.name;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			onClose();
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Couldn't export image.",
			);
		} finally {
			exporting.current = false;
		}
	};
	return (
		<div className="divide-y divide-black shadow-ridge">
			<header className="px-4 py-3">
				<h2 className="font-medium">Export image</h2>
				<p className="mt-1 text-xs text-neutral-400">
					Full resolution. All your edits included.
				</p>
			</header>
			<div className="space-y-4 p-4">
				<fieldset>
					<legend className="mb-2 text-xs text-neutral-400">Format</legend>
					<div className="grid grid-cols-2 gap-2">
						{formats.map(({ value, description }) => (
							<label key={value} className="cursor-pointer">
								<input
									className="peer sr-only"
									type="radio"
									name="export-format"
									value={value}
									checked={format === value}
									onChange={() => setFormat(value)}
								/>
								<span className="flex flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-neutral-400 hover:bg-neutral-700/30 peer-checked:border-neutral-500 peer-checked:bg-neutral-700 peer-checked:text-neutral-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neutral-400">
									<span className="text-sm font-medium uppercase">{value}</span>
									<span className="text-xs text-neutral-400">
										{description}
									</span>
								</span>
							</label>
						))}
					</div>
				</fieldset>
				<div className="min-h-16">
					{format === "jpeg" && (
						<>
							<Slider
								label="Quality"
								value={quality}
								onChange={setQuality}
								min={1}
								max={100}
							/>
							<p className="mt-2 text-xs text-neutral-500">
								Lower quality makes a smaller file.
							</p>
						</>
					)}
					{format === "png" && (
						<p className="text-xs leading-relaxed text-neutral-400">
							Preserves every detail without compression loss. Best for keeping
							a finished edit.
						</p>
					)}
				</div>
				{error && (
					<p className="text-sm text-red-400" role="alert">
						{error}
					</p>
				)}
			</div>
			<footer className="flex justify-end gap-2 bg-neutral-900/40 px-4 py-3">
				<Button variant="ghost" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={save}>Save image</Button>
			</footer>
		</div>
	);
}
