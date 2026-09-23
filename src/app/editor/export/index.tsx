import { Button } from "@roprgm/ui/button";
import { ScrubInput } from "@roprgm/ui/scrub-input";
import { Select } from "@roprgm/ui/select";
import { Slider } from "@roprgm/ui/slider";
import { Spinner } from "@roprgm/ui/spinner";
import { cn } from "cn";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { writeSceneFile } from "@/app/loaders/scene";
import { Image } from "@/components/editor/image";
import { EditorPanel, PanelBody, PanelHeader } from "@/components/editor/panel";
import { useDocument, useScene } from "@/components/editor/session";
import { EditorViewport, ViewportStage } from "@/components/editor/viewport";
import type { Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
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
      <div className="flex items-center justify-between text-neutral-400">
        Format
        <Select
          aria-label="Format"
          value={value.id}
          items={formats.map((format) => ({
            value: format.id,
            label: format.label,
          }))}
          className="h-7 w-28"
          onValueChange={(id) => {
            const format = formats.find((format) => format.id === id);
            if (format) onChange(format);
          }}
        />
      </div>
      <p className="text-neutral-500">{value.description}</p>
    </div>
  );
}

/** Width, height, and scale edit one long edge; extra rows share the grid. */
const pixels = (value: number) => `${value}px`;
const percent = (value: number) => `${value}%`;

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
    // Units follow their digits, as in a slider; the values' 4px padding reaches past the file size's edge.
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-neutral-400">
      <span>Width</span>
      <ScrubInput
        aria-label="Width"
        value={width}
        min={1}
        max={fullWidth}
        format={pixels}
        className="-mr-1 justify-self-end"
        onChange={(value) => scaleTo(value / fullWidth)}
      />
      <span>Height</span>
      <ScrubInput
        aria-label="Height"
        value={height}
        min={1}
        max={fullHeight}
        format={pixels}
        className="-mr-1 justify-self-end"
        onChange={(value) => scaleTo(value / fullHeight)}
      />
      <span>Scale</span>
      <ScrubInput
        aria-label="Scale"
        value={scale}
        min={1}
        max={100}
        format={percent}
        className="-mr-1 justify-self-end"
        onChange={(value) => scaleTo(value / 100)}
      />
      {children}
    </div>
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SaveScene() {
  const editorDocument = useDocument();
  const saving = useRef(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setError("");
    try {
      download(await writeSceneFile(editorDocument));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn't save scene.");
    } finally {
      saving.current = false;
    }
  };
  return (
    <section
      aria-label="Scene export"
      className="flex flex-col gap-3 border-black border-t p-4"
    >
      <p className="text-neutral-500">
        Saves the photo and every edit in one file. Open it to continue editing.
      </p>
      <Button className="w-full" onClick={save}>
        Save scene
      </Button>
      {error && (
        <p className="text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
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
export function ExportMode({ onClose }: { onClose: () => void }) {
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
  useShortcuts({ escape: onClose });
  const save = async () => {
    if (exporting.current) {
      return;
    }
    exporting.current = true;
    setError("");
    try {
      download(await exportImage(gpu, editorDocument, options));
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
      <EditorViewport size={encoded?.image.size ?? output}>
        <ViewportStage>
          {encoded && <Image image={encoded.image} />}
        </ViewportStage>
        {pending && <LoadingOverlay />}
      </EditorViewport>
      <EditorPanel>
        <PanelBody header={<PanelHeader title="Export" onClose={onClose} />}>
          <section
            aria-label="Image export"
            className="flex flex-col gap-5 p-4"
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
                  "flex items-center justify-end gap-1.5 text-neutral-100 tabular-nums",
                  pending && "text-neutral-500",
                )}
              >
                {encoded ? formatBytes(encoded.bytes) : "…"}
                {pending && <Spinner className="size-3" />}
              </span>
            </SizeFields>
            <Button className="w-full" onClick={save}>
              Save image
            </Button>
            {error && (
              <p className="text-red-400" role="alert">
                {error}
              </p>
            )}
          </section>
          <SaveScene />
        </PanelBody>
      </EditorPanel>
    </>
  );
}
