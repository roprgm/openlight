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
  const renderer = useDisposable(
    () =>
      createRenderer(gpu, source, {
        paintPixels: (id) => document.resources.paint(id),
        field: (id) => document.resources.field(id),
        saveField: (id, field) => document.resources.fillField(id, field),
      }),
    [gpu, document, source, createRenderer],
  );
  const [error, setError] = useState<string>();

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
    let requestedDensity: number | undefined;
    const render = () => {
      const scene = document.scene.getState();
      const target = adjustmentTarget(
        scene.layers,
        document.selection.getState().layerId,
      );
      const input = target && "toneCurve" in target ? target.id : undefined;
      const { rangeSource, density } = document.preview.getState();
      // An open gesture shows a Remove patch unfilled rather than synthesizing its field.
      const interactive = document.history.status.getState().editing;
      // A dropped input or source can stay live; only a new one needs a render.
      if (
        scene === requestedScene &&
        (input === requestedInput || !input) &&
        (rangeSource === requestedSource || !rangeSource) &&
        interactive === requestedInteractive &&
        density === requestedDensity
      ) {
        return;
      }
      requestedScene = scene;
      requestedInput = input;
      requestedSource = rangeSource;
      requestedInteractive = interactive;
      requestedDensity = density;
      setError(undefined);
      renderer
        .update(scene, input, interactive, rangeSource, density)
        .catch((error) => {
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
