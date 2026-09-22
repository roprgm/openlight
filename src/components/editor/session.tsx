import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { useStore } from "zustand";
import { type EditorDocument, findLayer, type Scene } from "@/core/document";
import { createCamera } from "@/hooks/use-pan-zoom";

const Session = createContext<{
  document: EditorDocument;
  camera: ReturnType<typeof createCamera>;
  width: number;
  onWidthChange: (width: number) => void;
} | null>(null);

export function useEditorSession() {
  const session = useContext(Session);
  if (!session) {
    throw new Error("An editor session is required.");
  }
  return session;
}
export function useDocument() {
  return useEditorSession().document;
}
export function useScene<T>(selector: (scene: Scene) => T) {
  return useStore(useDocument().scene, selector);
}
/** The selected layer, following both the scene and the selection. */
export function useSelectedLayer() {
  const document = useDocument();
  const id = useStore(document.selection, (state) => state.layerId);
  return useStore(document.scene, (scene) => findLayer(scene.layers, id));
}

/** Preserve document UI state while independent tools mount and unmount. */
export function DocumentProvider({
  value,
  children,
}: {
  value: EditorDocument;
  children: ReactNode;
}) {
  const size = useStore(value.scene, (scene) => scene.frame.size);
  const camera = useMemo(createCamera, [size[0], size[1]]);
  const [width, onWidthChange] = useState(320);
  return (
    <Session value={{ document: value, camera, width, onWidthChange }}>
      {children}
    </Session>
  );
}
