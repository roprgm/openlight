import { cn } from "cn";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { Image } from "@/components/editor/image";
import {
	PanelContent,
	useDocument,
	useScene,
} from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import Button from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ScrubInput } from "@/components/ui/scrub-input";
import { Slider } from "@/components/ui/slider";
import Spinner from "@/components/ui/spinner";
import type { Point } from "@/lib/image-frame/geometry";
import { type ExportFormat, exportImage, exportSize } from "./export-image";
import { useEncodedPreview } from "./preview";

type Format = {
	id: ExportFormat;
	label: string;
	description: string;
	lossy: boolean;
};

const formats: Format[] = [
	{
		id: "jpeg",
		label: "JPEG",
		description: "Small files, opens anywhere.",
		lossy: true,
	},
	{
		id: "png",
		label: "PNG",
		description: "Lossless, largest files.",
		lossy: false,
	},
	{
		id: "webp",
		label: "WebP",
		description: "Smaller than JPEG, less widely supported.",
		lossy: true,
	},
];

const kilobytes = new Intl.NumberFormat(undefined, {
	style: "unit",
	unit: "kilobyte",
	maximumFractionDigits: 0,
});
const megabytes = new Intl.NumberFormat(undefined, {
	style: "unit",
	unit: "megabyte",
	maximumFractionDigits: 1,
});

function formatBytes(bytes: number) {
	if (bytes < 1_000_000) {
		return kilobytes.format(bytes / 1000);
	}
	return megabytes.format(bytes / 1_000_000);
}

function FormatSelect({
	value,
	onChange,
}: {
	value: Format;
	onChange: (format: Format) => void;
}) {
	return (
		<div className="space-y-2">
			<label className="flex items-center justify-between text-neutral-400 text-sm">
				Format
				<Field className="relative w-28">
					<select
						aria-label="Format"
						value={value.id}
						className="w-full cursor-pointer bg-transparent px-1 text-neutral-100 outline-none [color-scheme:dark]"
						onChange={(event) =>
							onChange(formats[event.currentTarget.selectedIndex])
						}
					>
						{formats.map((format) => (
							<option key={format.id} value={format.id}>
								{format.label}
							</option>
						))}
					</select>
				</Field>
			</label>
			<p className="text-neutral-500 text-xs">{value.description}</p>
		</div>
	);
}

/** Width, height, and scale edit one long edge; extra rows share the grid. */
function SizeFields({
	size,
	longEdge,
	onChange,
	children,
}: {
	size: Point;
	longEdge: number;
	onChange: (longEdge: number) => void;
	children: ReactNode;
}) {
	const [fullWidth, fullHeight] = exportSize(size);
	const maxEdge = Math.max(fullWidth, fullHeight);
	const [width, height] = exportSize(size, longEdge);
	const scale = Math.round((100 * longEdge) / maxEdge);
	const scaleTo = (fraction: number) =>
		onChange(Math.max(1, Math.round(maxEdge * fraction)));
	return (
		<div className="grid grid-cols-[auto_1fr_1.5rem] items-center gap-x-3 gap-y-2 text-neutral-400 text-sm">
			<span>Width</span>
			<div className="justify-self-end">
				<ScrubInput
					aria-label="Width"
					value={width}
					min={1}
					max={fullWidth}
					onChange={(value) => scaleTo(value / fullWidth)}
				/>
			</div>
			<span className="text-neutral-500 text-xs">px</span>
			<span>Height</span>
			<div className="justify-self-end">
				<ScrubInput
					aria-label="Height"
					value={height}
					min={1}
					max={fullHeight}
					onChange={(value) => scaleTo(value / fullHeight)}
				/>
			</div>
			<span className="text-neutral-500 text-xs">px</span>
			<span>Scale</span>
			<div className="justify-self-end">
				<ScrubInput
					aria-label="Scale"
					value={scale}
					min={1}
					max={100}
					onChange={(value) => scaleTo(value / 100)}
				/>
			</div>
			<span className="text-neutral-500 text-xs">%</span>
			{children}
		</div>
	);
}

function LoadingOverlay() {
	return (
		<div className="pointer-events-none absolute inset-0 grid place-items-center">
			<Spinner className="size-8 border-neutral-500 border-t-white" />
		</div>
	);
}

/** Shows the encoded file on the canvas; a spinner marks results from earlier settings as loading. */
export function ExportMode() {
	const gpu = useGpu();
	const editorDocument = useDocument();
	const size = useScene((scene) => scene.frame.size);
	const maxEdge = Math.max(...exportSize(size));
	const [format, setFormat] = useState(formats[0]);
	const [quality, setQuality] = useState(80);
	const [longEdge, setLongEdge] = useState(maxEdge);
	const [error, setError] = useState("");
	const exporting = useRef(false);
	// A crop after choosing a size keeps the choice within the new document.
	const edge = Math.min(longEdge, maxEdge);
	const options = { format: format.id, quality, longEdge: edge };
	const output = useMemo(() => exportSize(size, edge), [size, edge]);
	const { encoded, pending } = useEncodedPreview(options);
	const save = async () => {
		if (exporting.current) {
			return;
		}
		exporting.current = true;
		setError("");
		try {
			const file = await exportImage(gpu, editorDocument, options);
			const url = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = url;
			link.download = file.name;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Couldn't export image.",
			);
		} finally {
			exporting.current = false;
		}
	};
	return (
		<>
			<EditorViewport
				size={encoded?.image.size ?? output}
				overlay={pending && <LoadingOverlay />}
			>
				{encoded && <Image image={encoded.image} />}
			</EditorViewport>
			<PanelContent>
				<section
					aria-label="Export settings"
					className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4"
				>
					<FormatSelect value={format} onChange={setFormat} />
					{format.lossy && (
						<Slider
							label="Quality"
							value={quality}
							onChange={setQuality}
							min={1}
							max={100}
							defaultValue={80}
						/>
					)}
					<SizeFields size={size} longEdge={edge} onChange={setLongEdge}>
						<span>File size</span>
						<span
							className={cn(
								"col-span-2 flex items-center justify-end gap-1.5 text-neutral-100 tabular-nums",
								pending && "text-neutral-500",
							)}
						>
							{encoded ? formatBytes(encoded.bytes) : "…"}
							{pending && <Spinner className="size-3" />}
						</span>
					</SizeFields>
					<Button className="w-full py-2" onClick={save}>
						Save image
					</Button>
					{error && (
						<p className="text-red-400 text-sm" role="alert">
							{error}
						</p>
					)}
				</section>
			</PanelContent>
		</>
	);
}
