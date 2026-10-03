import { useCallback, useEffect, useRef, useState } from "react";
import type { Target } from "vgpu";
import { useGpu } from "vgpu-react";
import { useDocument } from "@/components/editor/session";
import type { Primaries } from "@/core/image";
import { uploadDecoded } from "@/core/image/decode/upload";
import {
  type ExportOptions,
  type ExportRender,
  encodeExport,
  renderExport,
} from "./export-image";

/** Quiet time after a change before encoding; typical encodes take tens of milliseconds. */
const settleDelay = 150;

type Encoded = {
  key: string;
  bytes: number;
  image: Target;
  primaries: Primaries;
};

/**
 * The current edits rendered in full while the export view is open, again when they change, and
 * encoded once settings settle; `encode` makes the file to save from the same render. Renders,
 * encodes, and the release of a replaced render run one at a time in order, so nothing reads an
 * image after it goes, and a change during one waits for it. The last result stays available while
 * the current settings are still pending.
 */
export function useExportPreview({ format, quality, longEdge }: ExportOptions) {
  const gpu = useGpu();
  const document = useDocument();
  const render = useRef<ExportRender>(undefined);
  const queue = useRef(Promise.resolve());
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string>();
  const chain = useCallback(<T,>(step: () => Promise<T>) => {
    const result = queue.current.then(step);
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      chain(async () => {
        if (!active) {
          return;
        }
        try {
          const next = await renderExport(gpu, document);
          if (!active) {
            next.dispose();
            return;
          }
          render.current?.dispose();
          render.current = next;
          setError(undefined);
          setRevision((count) => count + 1);
        } catch (error) {
          if (active) {
            setError(
              error instanceof Error ? error.message : "Couldn't render.",
            );
          }
        }
      });
    void refresh();
    const unsubscribe = document.scene.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
      void chain(async () => {
        render.current?.dispose();
        render.current = undefined;
      });
    };
  }, [gpu, document, chain]);
  const key = `${format} ${quality} ${longEdge} ${revision}`;
  const [encoded, setEncoded] = useState<Encoded>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void chain(async () => {
        const current = render.current;
        if (!active || !current) {
          return;
        }
        try {
          const file = await encodeExport(gpu, current, {
            format,
            quality,
            longEdge,
          });
          const bitmap = await createImageBitmap(file);
          if (!active) {
            bitmap.close();
            return;
          }
          setEncoded({ key, bytes: file.size, ...uploadDecoded(gpu, bitmap) });
        } catch {
          if (active) {
            setEncoded(undefined);
          }
        }
      });
    }, settleDelay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gpu, chain, key, format, quality, longEdge]);
  useEffect(() => () => encoded?.image.color.dispose(), [encoded]);
  const encode = useCallback(
    (options: ExportOptions) =>
      chain(() => {
        if (!render.current) {
          throw Error("The photo is still rendering.");
        }
        return encodeExport(gpu, render.current, options);
      }),
    [gpu, chain],
  );
  return { encoded, pending: encoded?.key !== key, encode, error };
}
