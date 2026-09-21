import { useEffect, useRef } from "react";
import { useDocument } from "@/components/editor/session";
import { Select } from "@/components/ui/select";
import type { Fill } from "@/core/document";
import { setFill } from "./edits";
import { blends } from "./model";

export function FillControls({ id, fill }: { id: string; fill: Fill }) {
  const document = useDocument();
  const picker = useRef<HTMLInputElement>(null);
  // The picker streams input events while dragging; its native change event closes the gesture.
  useEffect(() => {
    const input = picker.current;
    const commit = () => document.history.commit();
    input?.addEventListener("change", commit);
    return () => input?.removeEventListener("change", commit);
  }, [document]);
  return (
    <section className="flex flex-col gap-3 p-3">
      <label className="flex items-center justify-between text-neutral-400">
        Color
        <span className="flex items-center gap-2">
          <span className="text-neutral-100 uppercase tabular-nums">
            {fill.color}
          </span>
          <input
            ref={picker}
            type="color"
            aria-label="Color"
            value={fill.color}
            className="h-6 w-9 cursor-pointer rounded border border-black bg-transparent p-0.5"
            onChange={(event) => {
              document.history.begin();
              setFill(document, { color: event.currentTarget.value }, id);
            }}
          />
        </span>
      </label>
      <div className="flex items-center justify-between text-neutral-400">
        Blend
        <Select
          aria-label="Blend"
          value={fill.blend}
          className="w-28"
          onChange={(event) => {
            const blend = blends.find(
              ([blend]) => blend === event.currentTarget.value,
            );
            if (blend) {
              setFill(document, { blend: blend[0] }, id);
            }
          }}
        >
          {blends.map(([blend, label]) => (
            <option key={blend} value={blend}>
              {label}
            </option>
          ))}
        </Select>
      </div>
    </section>
  );
}
