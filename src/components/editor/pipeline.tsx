import { Notice } from "@roprgm/ui/notice";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Gpu } from "vgpu";
import { useGpu } from "vgpu-react";
import { adjustmentTarget } from "@/core/document";
import type { ImageSource } from "@/core/image";
import type { createRenderer, RendererOptions } from "@/core/renderer";
import { useDisposable } from "@/hooks/use-disposable";
import { useDocument, useScene } from "./session";

const RendererContext = createContext<ReturnType<typeof createRenderer> | null>(
  null,
);

export function useRenderer() {
  const renderer = useContext(RendererContext);
  if (!renderer) {
    throw new Error("useRenderer requires RendererProvider.");
  }
  return renderer;
}

function RendererError({ message }: { message: string }) {
  return (
    <Notice tone="alert" className="fixed bottom-3 left-3 z-50">
      Renderer error: {message}
    </Notice>
  );
}

type RendererProviderProps = {
  children: ReactNode;
  createRenderer: (
    gpu: Gpu,
    source: ImageSource,
    options: RendererOptions,
  ) => ReturnType<typeof createRenderer>;
};

export function RendererProvider({
  children,
  createRenderer,
}: RendererProviderProps) {
  const gpu = useGpu();
  const document = useDocument();
  const sourceId = useScene((scene) => scene.layers[0].source);
  const source = document.resources.get(sourceId);
  const [error, setError] = useState<string>();
  const renderer = useDisposable(
    () =>
      createRenderer(gpu, source, {
        paintPixels: (id) => document.resources.paint(id),
        field: (id) => document.resources.field(id),
        saveField: (id, field) => document.resources.fillField(id, field),
        onError: (error) => setError(String(error)),
      }),
    [gpu, document, source, createRenderer],
  );

  // A snapshot reads back the Remove fields this renderer shows that the document still waits for.
  useEffect(
    () => document.onCaptureFields((ids) => renderer.captureFields(ids)),
    [renderer, document],
  );

  useEffect(() => {
    let active = true;
    let requestedScene: ReturnType<typeof document.scene.getState> | undefined;
    let requestedInput: string | undefined;
    let requestedSource: string | undefined;
    let requestedInteractive = false;
    const render = () => {
      const scene = document.scene.getState();
      const target = adjustmentTarget(
        scene.layers,
        document.selection.getState().layerId,
      );
      const input = target && "toneCurve" in target ? target.id : undefined;
      const source = document.preview.getState().rangeSource;
      // An open gesture keeps the display's density even where a Remove patch waits for its field.
      const interactive = document.history.status.getState().editing;
      // A dropped input or source can stay live; only a new one needs a render.
      if (
        scene === requestedScene &&
        (input === requestedInput || !input) &&
        (source === requestedSource || !source) &&
        interactive === requestedInteractive
      ) {
        return;
      }
      requestedScene = scene;
      requestedInput = input;
      requestedSource = source;
      requestedInteractive = interactive;
      setError(undefined);
      renderer.update(scene, input, interactive, source).catch((error) => {
        if (active) {
          setError(String(error));
        }
      });
    };
    const unsubscribeScene = document.scene.subscribe(render);
    const unsubscribeSelection = document.selection.subscribe(render);
    const unsubscribeHistory = document.history.status.subscribe(render);
    const unsubscribePreview = document.preview.subscribe(render);
    render();
    return () => {
      active = false;
      unsubscribeScene();
      unsubscribeSelection();
      unsubscribeHistory();
      unsubscribePreview();
    };
  }, [renderer, document]);

  return (
    <RendererContext value={renderer}>
      {children}
      {error && <RendererError message={error} />}
    </RendererContext>
  );
}
