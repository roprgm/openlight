import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Gpu } from "vgpu";
import { useGpu } from "vgpu-react";
import { adjustmentTarget } from "@/core/document";
import type { ImageSource } from "@/core/image";
import type { createRenderer } from "@/core/renderer";
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
    <p
      role="alert"
      className="fixed bottom-4 left-4 rounded bg-neutral-900 px-3 py-2 text-red-300"
    >
      Renderer error: {message}
    </p>
  );
}

type RendererProviderProps = {
  children: ReactNode;
  createRenderer: (
    gpu: Gpu,
    source: ImageSource,
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
  const renderer = useMemo(
    () => createRenderer(gpu, source),
    [gpu, source, createRenderer],
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let requestedScene: ReturnType<typeof document.scene.getState> | undefined;
    let requestedInput: string | undefined;
    let requestedInteractive = false;
    const render = () => {
      const scene = document.scene.getState();
      const target = adjustmentTarget(
        scene.layers,
        document.selection.getState().layerId,
      );
      const input =
        target && ("toneCurve" in target || target.kind === "heal")
          ? target.id
          : undefined;
      // An open gesture renders a proxy; its end renders the same scene in full.
      const interactive = document.history.status.getState().editing;
      // A dropped input can stay live; only a new one needs a render.
      if (
        scene === requestedScene &&
        (input === requestedInput || !input) &&
        interactive === requestedInteractive
      ) {
        return;
      }
      requestedScene = scene;
      requestedInput = input;
      requestedInteractive = interactive;
      setError(undefined);
      renderer.update(scene, input, interactive).catch((error) => {
        if (active) {
          setError(String(error));
        }
      });
    };
    const unsubscribeScene = document.scene.subscribe(render);
    const unsubscribeSelection = document.selection.subscribe(render);
    const unsubscribeHistory = document.history.status.subscribe(render);
    render();
    return () => {
      active = false;
      unsubscribeScene();
      unsubscribeSelection();
      unsubscribeHistory();
      renderer.dispose();
    };
  }, [renderer, document]);

  return (
    <RendererContext value={renderer}>
      {children}
      {error && <RendererError message={error} />}
    </RendererContext>
  );
}
