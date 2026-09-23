import type { Gpu } from "vgpu";
import { createImageLayer } from "@/app/editor/layers";
import type { Workspace } from "@/app/workspace";
import { createDocument, createResources } from "@/core/document";
import { canDecode, decode } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";

async function loadDocument(gpu: Gpu, file: File) {
  const decoded = await decode(gpu, file);
  const resources = createResources();
  const source = resources.add(file, decoded);
  return createDocument(
    {
      frame: imageFrame(decoded.image.size),
      layers: [createImageLayer(source, file.name, decoded.raw?.asShot)],
    },
    resources,
  );
}

export function createImageLoader(gpu: Gpu, workspace: Workspace) {
  return {
    kind: "document" as const,
    accepts: canDecode,
    async load(file: File) {
      if (!(file instanceof File)) {
        throw new Error("loadImage requires a File.");
      }
      await workspace.open(file.name, () => loadDocument(gpu, file));
    },
    /** Enters the loading state before the fetch starts, so the empty state never shows. */
    loadUrl(url: string) {
      const name = url.slice(url.lastIndexOf("/") + 1);
      return workspace.open(name, async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return loadDocument(gpu, new File([await response.blob()], name));
      });
    },
  };
}
