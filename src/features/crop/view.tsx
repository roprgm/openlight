import { useState } from "react";
import { Image } from "@/components/editor/image";
import { EditorPanel, PanelHeader } from "@/components/editor/panel";
import { useDocument, useEditorSession } from "@/components/editor/session";
import { EditorViewport } from "@/components/editor/viewport";
import { FlipIcon } from "@/components/icons/flip";
import { RotateIcon } from "@/components/icons/rotate";
import Button from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { imageFrame, type Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { applyCrop } from "./edits";
import { fitRatio, flip, rotate, turn } from "./geometry";
import { CropOverlay } from "./overlay";

const actions = [
  { label: "Rotate counterclockwise", turn: -1, transform: "scaleX(-1)" },
  { label: "Rotate clockwise", turn: 1, transform: "" },
  { label: "Flip horizontal", flip: 0, transform: "" },
  { label: "Flip vertical", flip: 1, transform: "rotate(90deg)" },
] as const;

export function CropEditor({ onClose }: { onClose: () => void }) {
  const document = useDocument();
  const { camera } = useEditorSession();
  const [frame, setFrame] = useState(() => document.scene.getState().frame);
  const [reference, setReference] = useState(frame.size);
  const [ratio, setRatio] = useState<number | null>(
    frame.size[0] / frame.size[1],
  );
  const sourceId = document.scene.getState().layers[0].source;
  const [width, height] = document.resources.get(sourceId).image.size;
  const source: Point = [width, height];
  function fitView() {
    camera.setState(camera.getInitialState(), true);
  }
  function reset() {
    setFrame(imageFrame(source));
    setReference(source);
    setRatio(source[0] / source[1]);
    fitView();
  }
  function apply() {
    applyCrop(document, frame);
    fitView();
    onClose();
  }
  useShortcuts({ enter: apply, escape: onClose }, { inputs: true });
  const original =
    frame.rotation % 180 ? source[1] / source[0] : source[0] / source[1];
  const ratios = {
    Original: original,
    Square: 1,
    "4:3": 4 / 3,
    "3:2": 3 / 2,
    "16:9": 16 / 9,
    "4:5": 4 / 5,
    "9:16": 9 / 16,
    "3:4": 3 / 4,
    "2:3": 2 / 3,
    "5:4": 5 / 4,
  };
  const custom = ratio !== null && !Object.values(ratios).includes(ratio);
  const ratioOptions = [
    { value: "free", label: "Free" },
    ...(custom && ratio !== null
      ? [{ value: `${ratio}`, label: "Current" }]
      : []),
    ...Object.entries(ratios).map(([label, value]) => ({
      value: `${value}`,
      label,
    })),
  ];
  function changeRatio(value: string) {
    const ratio = Number(value) || null;
    setRatio(ratio);
    if (ratio) {
      setFrame(fitRatio(frame, ratio));
    }
  }

  function applyAction(action: (typeof actions)[number]) {
    if ("turn" in action) {
      setFrame(turn(frame, action.turn));
      setReference([reference[1], reference[0]]);
      setRatio(ratio && 1 / ratio);
    } else {
      setFrame(flip(frame, action.flip));
    }
  }
  return (
    <>
      <EditorViewport size={reference} constrain={false}>
        <Image image="fullImage" geometry={frame} />
        <CropOverlay
          frame={frame}
          source={source}
          ratio={ratio}
          onChange={setFrame}
        />
      </EditorViewport>
      <EditorPanel
        header={<PanelHeader title="Crop" onClose={onClose} />}
        onKeyDown={(event) => {
          // Enter on a panel button is its click; the crop handles still apply.
          if (
            event.key === "Enter" &&
            event.target instanceof Element &&
            event.target.closest("button")
          ) {
            event.stopPropagation();
          }
        }}
        footer={
          <div className="border-t border-black p-3">
            <Button className="w-full py-2" onClick={apply}>
              Apply crop
            </Button>
          </div>
        }
      >
        <section aria-label="Crop tool" className="space-y-5 p-4">
          <div className="flex items-center justify-between text-neutral-400">
            Aspect ratio
            <Select
              aria-label="Aspect ratio"
              value={ratio === null ? "free" : `${ratio}`}
              options={ratioOptions}
              className="w-24"
              onChange={changeRatio}
            />
          </div>
          <section
            aria-label="Rotate and flip image"
            className="grid grid-cols-4 items-center gap-2"
          >
            <h3 className="col-span-3 text-neutral-400">Rotate & flip</h3>
            <Button
              variant="ghost"
              className="justify-self-end px-2 py-1"
              onClick={reset}
            >
              Reset
            </Button>

            {actions.map((action) => {
              const Icon = "turn" in action ? RotateIcon : FlipIcon;

              return (
                <Button
                  key={action.label}
                  variant="ghost"
                  aria-label={action.label}
                  title={action.label}
                  className="flex h-9 items-center justify-center gap-1 rounded-md px-1"
                  onClick={() => applyAction(action)}
                >
                  <Icon style={{ transform: action.transform }} />
                  {"turn" in action && <span>90°</span>}
                </Button>
              );
            })}
          </section>
          <Slider
            label="Rotation"
            min={-45}
            max={45}
            step={0.1}
            value={frame.angle}
            defaultValue={0}
            onChange={(angle) => setFrame(rotate(frame, angle, source))}
          />
          <p className="text-neutral-500">
            Drag edges or corners to crop, inside to move, outside to rotate.
            Space + drag to pan; Ctrl/⌘ + scroll to zoom.
          </p>
          <p className="tabular-nums text-neutral-400">
            {frame.size.map(Math.round).join(" × ")} px
          </p>
        </section>
      </EditorPanel>
    </>
  );
}
