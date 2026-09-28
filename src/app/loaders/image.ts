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
      return workspace.open(file.name, () => loadDocument(gpu, file));
    },
    /** Enters the loading state before the fetch starts, so the empty state never shows. */
    async loadUrl(url: string) {
      const { pathname } = new URL(url, location.href);
      const name = decodeURIComponent(
        pathname.slice(pathname.lastIndexOf("/") + 1),
      );
      return workspace.open(name, async () => {
        // The browser hides why a request failed, so name the usual causes.
        const response = await fetch(url).catch(() => {
          throw new Error(
            "The request failed. Another origin must allow CORS, and a local address needs the browser's permission.",
          );
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        return loadDocument(gpu, new File([blob], name, { type: blob.type }));
      });
    },
  };
}
