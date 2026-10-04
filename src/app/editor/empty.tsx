import { Button } from "@roprgm/ui/button";
import { Notice } from "@roprgm/ui/notice";
import { Section } from "@roprgm/ui/section";
import { Spinner } from "@roprgm/ui/spinner";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { type Gpu, target } from "vgpu";
import { useGpu } from "vgpu-react";
import type { Workspace } from "@/app/workspace";
import { EditorFrame, EditorLayout } from "@/components/editor/layout";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider } from "@/components/editor/session";
import { BlankIcon } from "@/components/icons/blank";
import { DropIcon } from "@/components/icons/drop";
import { Icon } from "@/components/icons/icon";
import { OpenIcon } from "@/components/icons/open";
import { SampleIcon } from "@/components/icons/sample";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { MaskToolProvider } from "@/features/layers/mask-tool";
import { useDisposable } from "@/hooks/use-disposable";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { AdjustDock } from "./adjust";
import { Backdrop } from "./backdrop";
import { DockTabList } from "./dock";
import { EditorHeader } from "./header";
import { createImageLayer } from "./layers";
import { FileInput } from "./open";
import { createEditorRenderer } from "./renderer";
import { PlaceholderSidebar } from "./sidebar";
import { ToolTabList } from "./tool-rail";
import { tools } from "./tools";

type StartProps = {
  onOpen: (files: File[]) => void;
  onOpenSample: () => void;
};

type EmptyState = Exclude<
  ReturnType<Workspace["state"]["getState"]>,
  { status: "ready" }
>;

/** A draft kept from an earlier visit, offered until it is recovered or forgotten. */
export type Recovery = {
  onRecover: () => void;
  onForget: () => void;
};

/** Offered away from the welcome copy, since returning users see it on every visit. */
function RecoverDraft({ onRecover, onForget }: Recovery) {
  return (
    <Notice className="absolute bottom-3 left-3 z-50">
      <Section>Your last scene is still here from a previous visit.</Section>
      <Section className="flex-row gap-1.5 px-2.5">
        <Button size="sm" onClick={onRecover}>
          Recover
        </Button>
        <Button size="sm" variant="ghost" onClick={onForget}>
          Forget
        </Button>
      </Section>
    </Notice>
  );
}

/** Blank canvas sizes, narrowest first; Landscape is a 12 MP photo's 4:3. */
const canvasSizes = [
  { name: "Portrait", width: 3000, height: 4000 },
  { name: "Square", width: 3000, height: 3000 },
  { name: "Landscape", width: 4000, height: 3000 },
  { name: "Widescreen", width: 3840, height: 2160 },
];

/** A white SVG of that size, so a blank canvas opens, saves, and recovers as any image file does. */
function blankImage(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/></svg>`;
  return new File([svg], "Untitled", { type: "image/svg+xml" });
}

/** A canvas's proportions, outlined in the frame the other icons' shapes fill. */
function ShapeIcon({ width, height }: { width: number; height: number }) {
  const scale = 14 / Math.max(width, height);
  return (
    <Icon viewBox="0 0 20 20">
      <rect
        x={10 - (width * scale) / 2}
        y={10 - (height * scale) / 2}
        width={width * scale}
        height={height * scale}
        rx="2"
      />
    </Icon>
  );
}

/**
 * A flat tile over the backdrop, a row in a narrow container and a column in a wide one; its icon
 * takes the color of the backdrop's motes on hover. Between views, it morphs into the tile of the
 * same name while their contents swap.
 */
function StartTile({
  name,
  icon,
  title,
  hint,
  ...props
}: ComponentProps<"button"> & {
  name: string;
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      style={{ viewTransitionName: name }}
      className="group flex cursor-pointer rounded-xl bg-white/4 p-4 text-left ring-1 ring-white/6 ring-inset backdrop-blur-xs transition-colors [view-transition-class:start-tile] hover:bg-white/8 hover:ring-white/10 focus-ring @lg:h-36"
      {...props}
    >
      <span
        style={{ viewTransitionName: `${name}-content` }}
        className="flex flex-1 items-center gap-3 [view-transition-class:start-content] @lg:flex-col @lg:items-start @lg:justify-between"
      >
        <span className="flex text-secondary transition-colors group-hover:text-[oklch(90%_0.045_85)] *:size-6">
          {icon}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted">{hint}</span>
        </span>
      </span>
    </button>
  );
}

function StartTiles({
  blank,
  onOpen,
  onOpenSample,
  onChooseSize,
}: StartProps & {
  blank: RefObject<HTMLButtonElement | null>;
  onChooseSize: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="grid w-full max-w-[33rem] gap-2.5 @lg:grid-cols-3">
        <StartTile
          name="start-0"
          icon={<OpenIcon />}
          title="Open a photo"
          hint="JPEG, HEIC, TIFF, or RAW"
          onClick={() => input.current?.click()}
        />
        <StartTile
          ref={blank}
          name="start-1"
          icon={<BlankIcon />}
          title="Blank canvas"
          hint="Start from a white image"
          onClick={onChooseSize}
        />
        <StartTile
          name="start-2"
          icon={<SampleIcon />}
          title="Sample photo"
          hint="Try the tools on a demo"
          onClick={onOpenSample}
        />
      </div>
      <p className="flex items-center gap-1.5 text-muted">
        <DropIcon className="size-4" />
        Or drop an image anywhere
      </p>
      <FileInput ref={input} onOpen={onOpen} />
    </>
  );
}

/** The blank canvas sizes, in the start tiles' places, so each tile morphs into one. */
function CanvasSizes({
  first,
  onOpen,
  onBack,
}: Pick<StartProps, "onOpen"> & {
  first: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
}) {
  useShortcuts({ escape: onBack });
  return (
    <>
      <div className="grid w-full max-w-[44rem] grid-cols-2 gap-2.5 @lg:grid-cols-4">
        {canvasSizes.map(({ name, width, height }, index) => (
          <StartTile
            key={name}
            ref={index === 0 ? first : undefined}
            name={`start-${index}`}
            icon={<ShapeIcon width={width} height={height} />}
            title={name}
            hint={`${width} × ${height}`}
            onClick={() => onOpen([blankImage(width, height)])}
          />
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onBack}>
        Back
      </Button>
    </>
  );
}

/** The ways to begin under a heading; Blank canvas turns the tiles into its sizes and back. */
function Starts({
  heading,
  ...starts
}: StartProps & {
  heading: ReactNode;
}) {
  const [choosing, setChoosing] = useState(false);
  const blank = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  /** Swaps the tiles inside a view transition, then focuses what shows. */
  function choose(next: boolean) {
    window.document.startViewTransition(() => {
      flushSync(() => setChoosing(next));
      (next ? first : blank).current?.focus();
    });
  }

  return (
    <div className="@container flex w-full flex-col items-center gap-6 md:gap-8">
      <div style={{ viewTransitionName: "start-heading" }}>{heading}</div>
      {choosing ? (
        <CanvasSizes
          first={first}
          onOpen={starts.onOpen}
          onBack={() => choose(false)}
        />
      ) : (
        <StartTiles
          blank={blank}
          onChooseSize={() => choose(true)}
          {...starts}
        />
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <img
        alt=""
        className="mb-1 w-12"
        height="48"
        src="/logo.svg"
        width="48"
      />
      <h1 className="text-2xl font-bold">OpenLight</h1>
      <p className="text-secondary">Edit photos in your browser.</p>
    </div>
  );
}

function Status({ state, ...starts }: { state: EmptyState } & StartProps) {
  if (state.status === "loading") {
    return <Spinner className="size-5" />;
  }
  const heading =
    state.status === "error" ? (
      <p className="max-w-md text-center text-secondary">
        Couldn't open {state.file}: {state.error}
      </p>
    ) : (
      <Welcome />
    );
  return <Starts heading={heading} {...starts} />;
}

/** A scene over a blank pixel, so the real panels mount with defaults; it never enters the workspace. */
function createEmptyDocument(gpu: Gpu) {
  const resources = createResources();
  const image = target(gpu, { size: [1, 1], format: "rgba16float" });
  const source = resources.add(new File([], ""), createImageSource(image));
  return createDocument(
    {
      frame: imageFrame([1, 1]),
      layers: [createImageLayer(source, "Untitled")],
    },
    resources,
  );
}

/** The editor shell without a document: the light backdrop and workspace status fill the canvas area, beside inert controls. */
export function EmptyEditor({
  state,
  draft,
  ...starts
}: { state: EmptyState; draft?: Recovery } & StartProps) {
  const gpu = useGpu();
  const document = useDisposable(() => createEmptyDocument(gpu), [gpu]);
  return (
    <DocumentProvider value={document}>
      <RendererProvider createRenderer={createEditorRenderer}>
        <MaskToolProvider onCreate={() => {}}>
          <EditorHeader file={state.file} />
          <EditorFrame
            rail={<ToolTabList selected={tools[0]} />}
            tabs={<DockTabList selected={tools[0]} />}
          >
            <EditorLayout
              inert
              canvas={
                <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle,#292929,#131313_55%)] p-6">
                  <Backdrop />
                  <Status state={state} {...starts} />
                  {draft && <RecoverDraft {...draft} />}
                </div>
              }
              panel={<PlaceholderSidebar />}
              dock={<AdjustDock />}
            />
          </EditorFrame>
        </MaskToolProvider>
      </RendererProvider>
    </DocumentProvider>
  );
}
