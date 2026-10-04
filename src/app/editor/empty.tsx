import { Button } from "@roprgm/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@roprgm/ui/menu";
import { Notice } from "@roprgm/ui/notice";
import { Section } from "@roprgm/ui/section";
import { Spinner } from "@roprgm/ui/spinner";
import { type ComponentProps, type ComponentType, useRef } from "react";
import { type Gpu, target } from "vgpu";
import { useGpu } from "vgpu-react";
import type { Workspace } from "@/app/workspace";
import { EditorFrame, EditorLayout } from "@/components/editor/layout";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider } from "@/components/editor/session";
import { BlankIcon } from "@/components/icons/blank";
import { DropIcon } from "@/components/icons/drop";
import type { IconProps } from "@/components/icons/icon";
import { OpenIcon } from "@/components/icons/open";
import { SampleIcon } from "@/components/icons/sample";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { MaskToolProvider } from "@/features/layers/mask-tool";
import { useDisposable } from "@/hooks/use-disposable";
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

const blankSizes = [
  { name: "Square", width: 2048, height: 2048 },
  { name: "Landscape", width: 3000, height: 2000 },
  { name: "Portrait", width: 2000, height: 3000 },
  { name: "Widescreen", width: 3840, height: 2160 },
];

/** A white PNG, so a blank canvas opens, saves, and recovers as any image file does. */
async function blankImage(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("A 2D canvas is unavailable.");
  }
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new File([blob], "Untitled.png", { type: blob.type });
}

/** A flat tile over the backdrop; its icon takes the color of the backdrop's motes on hover. */
function StartTile({
  icon: Glyph,
  title,
  hint,
  ...props
}: ComponentProps<"button"> & {
  icon: ComponentType<IconProps>;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      className="group flex cursor-pointer items-center gap-3 rounded-xl bg-white/4 p-4 text-left ring-1 ring-white/6 ring-inset backdrop-blur-xs transition-colors hover:bg-white/8 hover:ring-white/10 focus-ring data-popup-open:bg-white/8 md:aspect-6/5 md:flex-col md:items-start md:justify-between"
      {...props}
    >
      <Glyph className="size-6 text-secondary transition-colors group-hover:text-[oklch(90%_0.045_85)]" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted">{hint}</span>
      </span>
    </button>
  );
}

function BlankCanvas({ onOpen }: Pick<StartProps, "onOpen">) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <StartTile
            icon={BlankIcon}
            title="Blank canvas"
            hint="Start from a white image"
          />
        }
      />
      <MenuContent align="center">
        {blankSizes.map(({ name, width, height }) => (
          <MenuItem
            key={name}
            onClick={async () => onOpen([await blankImage(width, height)])}
          >
            {name}
            <span className="ml-auto pl-4 text-muted">
              {width} × {height}
            </span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** The ways to begin, with dropping a file onto the page named under them. */
function Starts({ onOpen, onOpenSample }: StartProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="grid w-full max-w-[33rem] gap-2 md:grid-cols-3">
        <StartTile
          icon={OpenIcon}
          title="Open a photo"
          hint="JPEG, HEIC, TIFF, or RAW"
          onClick={() => input.current?.click()}
        />
        <BlankCanvas onOpen={onOpen} />
        <StartTile
          icon={SampleIcon}
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
  return (
    <div className="flex w-full flex-col items-center gap-6 md:gap-8">
      {state.status === "error" ? (
        <p className="max-w-md text-center text-secondary">
          Couldn't open {state.file}: {state.error}
        </p>
      ) : (
        <Welcome />
      )}
      <Starts {...starts} />
    </div>
  );
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
