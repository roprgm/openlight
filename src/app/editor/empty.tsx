import { useEffect, useMemo, useRef } from "react";
import { type Gpu, target } from "vgpu";
import { useGpu } from "vgpu-react";
import type { Workspace } from "@/app/workspace";
import { RendererProvider } from "@/components/editor/pipeline";
import { DocumentProvider } from "@/components/editor/session";
import Button from "@/components/ui/button";
import Spinner from "@/components/ui/spinner";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { accept } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";
import { GradientProvider } from "@/features/layers/gradient-tool";
import { AdjustPanel } from "./adjust";
import Backdrop from "./backdrop";
import { EditorHeader } from "./header";
import { createImageLayer } from "./layers";
import { ModeTabList } from "./mode-rail";
import { modes } from "./modes";
import { createEditorRenderer } from "./renderer";
import { EditorSidebar } from "./sidebar";

type OpenProps = { onOpen: (files: File[]) => void };

function OpenImage({ onOpen }: OpenProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button className="mt-3" onClick={() => input.current?.click()}>
        Open image
      </Button>
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
    </>
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
      <RendererProvider createRenderer={createEditorRenderer}>
        <GradientProvider onCreate={() => {}}>
          <EditorHeader file={state.file} />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <ModeTabList selected={modes[0]} />
            <div className="relative isolate grid min-h-0 min-w-0 flex-1 place-content-center justify-items-center gap-3 overflow-hidden bg-[radial-gradient(circle,#292929,#131313_55%)] p-6">
              <Backdrop />
              <Status state={state} onOpen={onOpen} />
            </div>
            <EditorSidebar inert>
              <AdjustPanel />
            </EditorSidebar>
          </div>
        </GradientProvider>
      </RendererProvider>
    </DocumentProvider>
  );
}
