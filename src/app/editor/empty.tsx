import { useEffect, useMemo, useRef } from "react";
import { type Gpu, target } from "vgpu";
import { useGpu } from "vgpu-react";
import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider } from "@/components/editor/session";
import Spinner from "@/components/ui/spinner";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { accept } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";
import { MaskToolProvider } from "@/features/layers/mask-tool";
import { AdjustPanel } from "./adjust";
import Backdrop from "./backdrop";
import { EditorHeader } from "./header";
import { createImageLayer } from "./layers";
import { createEditorRenderer } from "./renderer";
import { EditorSidebar } from "./sidebar";
import { ToolTabList } from "./tool-rail";
import { tools } from "./tools";

type OpenProps = { onOpen: (files: File[]) => void };

/** The drop hint doubles as the picker: "choose a file" opens the input. */
function OpenImage({ onOpen }: OpenProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <p className="mt-8 rounded-full border border-neutral-700 border-dashed px-5 py-2.5 text-neutral-500">
      Drop an image here or{" "}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="cursor-pointer text-neutral-200 underline decoration-neutral-600 underline-offset-4 transition-colors hover:decoration-neutral-200 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-400/80"
      >
        choose a file
      </button>
      <input
        accept={accept}
        hidden
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files?.length) {
            onOpen(Array.from(files));
          }
        }}
        ref={input}
        type="file"
      />
    </p>
  );
}

type EmptyState = Exclude<
  ReturnType<Workspace["state"]["getState"]>,
  { status: "ready" }
>;

function Status({ state, onOpen }: { state: EmptyState } & OpenProps) {
  if (state.status === "loading") {
    return <Spinner />;
  }
  if (state.status === "error") {
    return (
      <>
        <p className="max-w-md text-center text-neutral-400">
          Couldn't open {state.file}: {state.error}
        </p>
        <OpenImage onOpen={onOpen} />
      </>
    );
  }
  return (
    <>
      <img alt="" className="w-16" height="64" src="/logo.svg" width="64" />
      <h1 className="text-2xl font-bold">OpenLight</h1>
      <p className="text-neutral-400">Edit photos in your browser.</p>
      <OpenImage onOpen={onOpen} />
    </>
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

/** The editor shell without a document: the light backdrop and workspace status fill the canvas area. */
export function EmptyEditor({
  state,
  onOpen,
}: { state: EmptyState } & OpenProps) {
  const gpu = useGpu();
  const document = useMemo(() => createEmptyDocument(gpu), [gpu]);
  useEffect(() => () => document.dispose(), [document]);
  return (
    <DocumentProvider value={document}>
      <RendererProvider
        createRenderer={(rendererGpu, source) =>
          createEditorRenderer(rendererGpu, source)
        }
      >
        <MaskToolProvider onCreate={() => {}}>
          <EditorHeader file={state.file} />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <ToolTabList selected={tools[0]} />
            <div className="relative isolate grid min-h-0 min-w-0 flex-1 place-content-center justify-items-center gap-3 overflow-hidden bg-[radial-gradient(circle,#292929,#131313_55%)] p-6">
              <Backdrop />
              <Status state={state} onOpen={onOpen} />
            </div>
            <EditorSidebar inert>
              <AdjustPanel />
            </EditorSidebar>
          </div>
        </MaskToolProvider>
      </RendererProvider>
    </DocumentProvider>
  );
}
