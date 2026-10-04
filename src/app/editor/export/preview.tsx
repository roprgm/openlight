import { useEffect, useState } from "react";
import { useGpu } from "vgpu-react";
import { useDocument } from "@/components/editor/session";
import type { EncodedImage } from "@/core/image";
import { uploadDecoded } from "@/core/image/decode/upload";
import { useDisposable } from "@/hooks/use-disposable";
import { createExportSession, type ExportOptions } from "./export-image";

/** Quiet time after a change before encoding; typical encodes take tens of milliseconds. */
const settleDelay = 150;

type Encoded = EncodedImage & { key: string; bytes: number };

/**
 * An export session for the view's lifetime, rendered again when the edits change, and its latest
 * render encoded once settings settle; `encode` makes the file to save from the same render. The
 * last encoded result stays available while the current settings are still pending.
 */
export function useExportPreview({ format, quality, longEdge }: ExportOptions) {
  const gpu = useGpu();
  const document = useDocument();
  const session = useDisposable(
    () => createExportSession(gpu, document),
    [gpu, document],
  );
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const unsubscribe = session.subscribe((failure) => {
      setError(failure);
      if (!failure) {
        setRevision((count) => count + 1);
      }
    });
    void session.refresh();
    const stop = document.scene.subscribe(() => void session.refresh());
    return () => {
      unsubscribe();
      stop();
    };
  }, [session, document]);
  const key = `${format} ${quality} ${longEdge} ${revision}`;
  const [encoded, setEncoded] = useState<Encoded>();
  useEffect(() => {
    if (!revision) {
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const file = await session.encode({ format, quality, longEdge });
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
    }, settleDelay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gpu, session, key, revision, format, quality, longEdge]);
  useEffect(() => () => encoded?.image.color.dispose(), [encoded]);
  return {
    encoded,
    pending: encoded?.key !== key,
    encode: session.encode,
    error,
  };
}
