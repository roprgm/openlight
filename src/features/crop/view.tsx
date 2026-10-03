import { Button } from "@roprgm/ui/button";
import { Select } from "@roprgm/ui/select";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { type KeyboardEvent, useState } from "react";
import { DockChips, DockControls } from "@/components/editor/dock";
import { Image } from "@/components/editor/image";
import { EditorLayout } from "@/components/editor/layout";
import { PanelBody, PanelHeader } from "@/components/editor/panel";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument, useEditorSession } from "@/components/editor/session";
import { EditorViewport, ViewportStage } from "@/components/editor/viewport";
import { FlipIcon } from "@/components/icons/flip";
import { RotateIcon } from "@/components/icons/rotate";
import { Dial } from "@/components/ui/dial";
import { imageFrame, type Point } from "@/core/image/frame";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { isTyping, typingFields } from "@/lib/dom";
import { applyCrop } from "./edits";
import {
  correctShown,
  fitRatio,
  flip,
  rotate,
  shownPerspective,
  turn,
} from "./geometry";
import { CropOverlay } from "./overlay";

const actions = [
  { label: "Rotate counterclockwise", turn: -1, transform: "scaleX(-1)" },
  { label: "Rotate clockwise", turn: 1, transform: "" },
  { label: "Flip horizontal", flip: 0, transform: "" },
  { label: "Flip vertical", flip: 1, transform: "rotate(90deg)" },
] as const;

function ActionButton({
  action,
  onClick,
}: {
  action: (typeof actions)[number];
  onClick: () => void;
}) {
  const Icon = "turn" in action ? RotateIcon : FlipIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            aria-label={action.label}
            className="flex h-9 items-center justify-center gap-1 rounded-md px-1"
            onClick={onClick}
          >
            <Icon style={{ transform: action.transform }} />
            {"turn" in action && <span>90°</span>}
          </Button>
        }
      />
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>
  );
}

/** Named ratios as width and height, so a quarter turn swaps them into another. */
const presets = [
  ["Square", 1, 1],
  ["4:3", 4, 3],
  ["3:2", 3, 2],
  ["16:9", 16, 9],
  ["4:5", 4, 5],
  ["9:16", 9, 16],
  ["3:4", 3, 4],
  ["2:3", 2, 3],
  ["5:4", 5, 4],
] as const;
type Preset = (typeof presets)[number][0];

/**
 * What the ratio control holds: the choice, not its number, so Original and 3:2 stay apart on a 3:2
 * photo. Current is the frame's own ratio when it matches no other.
 */
type Choice = "free" | "original" | "current" | Preset;

function preset(choice: Choice) {
  return presets.find(([name]) => name === choice);
}

/** What the dock's middle row adjusts on a phone. */
type DockMode = "rotate" | "perspective";
const dockModes = [
  ["rotate", "Rotate"],
  ["perspective", "Perspective"],
] as const;

/** Enter on a panel button is its click and in a field commits the value; elsewhere it applies the crop. */
function keepEnter(event: KeyboardEvent) {
  if (
    event.key === "Enter" &&
    isTyping(event.target, `${typingFields}, button`)
  ) {
    event.stopPropagation();
  }
}

export function CropEditor({ onClose }: { onClose: () => void }) {
  const document = useDocument();
  const { camera } = useEditorSession();
  const [frame, setFrame] = useState(() => document.scene.getState().frame);
  const [reference, setReference] = useState(frame.size);
  const [mode, setMode] = useState<DockMode>("rotate");
  const sourceId = document.scene.getState().layers[0].source;
  const [width, height] = document.resources.get(sourceId).image.size;
  const source: Point = [width, height];
  const original =
    frame.rotation % 180 ? source[1] / source[0] : source[0] / source[1];
  const [current, setCurrent] = useState(frame.size[0] / frame.size[1]);
  const [choice, setChoice] = useState<Choice>(() => {
    if (current === original) return "original";
    return presets.find(([, w, h]) => w / h === current)?.[0] ?? "current";
  });
  function ratioOf(choice: Choice) {
    if (choice === "free") return null;
    if (choice === "original") return original;
    if (choice === "current") return current;
    const [, w, h] = preset(choice) ?? [];
    return w && h ? w / h : null;
  }
  const ratio = ratioOf(choice);
  function fitView() {
    camera.setState(camera.getInitialState(), true);
  }
  function reset() {
    setFrame(imageFrame(source));
    setReference(source);
    setChoice("original");
    fitView();
  }
  function apply() {
    applyCrop(document, frame);
    fitView();
    onClose();
  }
  useShortcuts({ enter: apply, escape: onClose }, { inputs: true });
  const ratioOptions: { value: Choice; label: string }[] = [
    { value: "free", label: "Free" },
    ...(choice === "current"
      ? [{ value: "current" as const, label: "Current" }]
      : []),
    { value: "original", label: "Original" },
    ...presets.map(([name]) => ({ value: name, label: name })),
  ];
  function changeRatio(next: Choice) {
    setChoice(next);
    const ratio = ratioOf(next);
    if (ratio) {
      setFrame(fitRatio(frame, ratio));
    }
  }

  function applyAction(action: (typeof actions)[number]) {
    if ("turn" in action) {
      setFrame(turn(frame, action.turn));
      setReference([reference[1], reference[0]]);
      // Original follows the turned photo by itself; a named ratio swaps its sides, and Current inverts.
      const named = preset(choice);
      if (named) {
        const [, w, h] = named;
        setChoice(
          presets.find(([, tw, th]) => tw === h && th === w)?.[0] ?? choice,
        );
      } else if (choice === "current") {
        setCurrent(1 / current);
      }
    } else {
      setFrame(flip(frame, action.flip));
    }
  }
  const rotation = {
    label: "Rotation",
    min: -45,
    max: 45,
    step: 0.1,
    value: frame.angle,
    defaultValue: 0,
    onChange: (angle: number) => setFrame(rotate(frame, angle, source)),
  };
  const shown = shownPerspective(frame);
  /** Perspective along the displayed axes, so Vertical stays vertical through quarter turns and flips. */
  function keystone(id: string, label: string, axis: 0 | 1): Parameter {
    return {
      id,
      label,
      min: -100,
      max: 100,
      step: 1,
      value: shown[axis],
      defaultValue: 0,
      onChange: (value) =>
        setFrame(
          correctShown(
            frame,
            axis ? [shown[0], value] : [value, shown[1]],
            source,
          ),
        ),
    };
  }
  const perspective = [
    keystone("vertical", "Vertical", 1),
    keystone("horizontal", "Horizontal", 0),
  ];
  const size = `${frame.size.map(Math.round).join(" × ")} px`;
  // On a phone the ratios are chips beside a choice of what the row between them and the actions
  // footer adjusts: rotation between the turns and flips, or perspective's dials.
  const dock = (
    <fieldset
      aria-label="Crop"
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onKeyDown={keepEnter}
    >
      <DockControls
        parameters={mode === "perspective" ? perspective : undefined}
        header={
          <div className="flex min-w-0 items-center gap-2">
            <div className="shrink-0">
              <DockChips
                label="Controls"
                items={dockModes}
                value={mode}
                onChange={setMode}
              />
            </div>
            <DockChips
              label="Aspect ratio"
              items={ratioOptions.map(
                ({ value, label }) => [value, label] as const,
              )}
              value={choice}
              onChange={changeRatio}
            />
          </div>
        }
      >
        {/* As tall as the dial row that takes its place, so switching keeps the canvas still. */}
        <section
          aria-label="Rotate and flip image"
          className="flex h-21 shrink-0 items-center justify-center gap-2"
        >
          {actions.slice(0, 2).map((action) => (
            <ActionButton
              key={action.label}
              action={action}
              onClick={() => applyAction(action)}
            />
          ))}
          <Dial {...rotation} format={(angle) => `${angle}°`} />
          {actions.slice(2).map((action) => (
            <ActionButton
              key={action.label}
              action={action}
              onClick={() => applyAction(action)}
            />
          ))}
        </section>
      </DockControls>
      <div className="flex items-center gap-1.5 px-2.5 pb-3">
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
        <span className="flex-1 truncate text-center text-secondary tabular-nums">
          {size}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply}>
          Apply
        </Button>
      </div>
    </fieldset>
  );
  return (
    <EditorLayout
      canvas={
        <EditorViewport size={reference} constrain={false}>
          <ViewportStage>
            <Image image="fullImage" geometry={frame} />
            <CropOverlay
              frame={frame}
              source={source}
              ratio={ratio}
              onChange={setFrame}
            />
          </ViewportStage>
        </EditorViewport>
      }
      panel={
        <fieldset
          aria-label="Crop"
          className="flex min-h-0 min-w-0 flex-1 flex-col *:not-last:shadow-[inset_0_-1px_0_var(--color-edge)]"
          onKeyDown={keepEnter}
        >
          <PanelBody
            header={
              <PanelHeader title="Crop" onClose={onClose}>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Reset
                </Button>
              </PanelHeader>
            }
          >
            <section aria-label="Crop tool" className="space-y-5 p-3.5">
              <div className="flex items-center justify-between text-secondary">
                Aspect ratio
                <Select
                  raised
                  aria-label="Aspect ratio"
                  value={choice}
                  items={ratioOptions}
                  className="w-24"
                  onValueChange={(value) =>
                    value !== null && changeRatio(value)
                  }
                />
              </div>
              <section
                aria-label="Rotate and flip image"
                className="grid grid-cols-4 items-center gap-2"
              >
                <h3 className="col-span-4 text-secondary">Rotate & flip</h3>
                {actions.map((action) => (
                  <ActionButton
                    key={action.label}
                    action={action}
                    onClick={() => applyAction(action)}
                  />
                ))}
              </section>
              <Slider {...rotation} />
              <section aria-label="Perspective" className="space-y-3">
                <h3 className="text-secondary">Perspective</h3>
                {perspective.map(({ id, ...parameter }) => (
                  <Slider key={id} {...parameter} />
                ))}
              </section>
              <p className="text-secondary">
                Drag edges or corners to crop, inside to move, outside to
                rotate. Space + drag to pan; Ctrl/⌘ + scroll to zoom.
              </p>
              <p className="tabular-nums text-secondary">{size}</p>
            </section>
          </PanelBody>
          <div className="p-3">
            <Button size="lg" className="w-full" onClick={apply}>
              Apply crop
            </Button>
          </div>
        </fieldset>
      }
      dock={dock}
    />
  );
}
