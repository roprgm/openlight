import { IconButton } from "@roprgm/ui/icon-button";
import { useEffect } from "react";
import { useStore } from "zustand";
import { useDocument } from "@/components/editor/session";
import type { Preview } from "@/core/document";
import { isTyping } from "@/lib/dom";

export function ComparisonControl() {
  const { preview } = useDocument();
  const comparison = useStore(preview, (state) => state.comparison);
  useEffect(() => {
    let restore: Preview["comparison"] | undefined;
    function release() {
      if (restore === undefined) {
        return;
      }
      preview.setState({ comparison: restore });
      restore = undefined;
    }
    function keyDown(event: KeyboardEvent) {
      if (
        event.code !== "Backslash" ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (isTyping(event.target)) {
        return;
      }
      event.preventDefault();
      restore = preview.getState().comparison;
      preview.setState({ comparison: "original" });
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code === "Backslash") {
        release();
      }
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [preview]);
  return (
    <IconButton
      label="Compare before and after"
      shortcut="Hold \"
      size="icon-sm"
      aria-pressed={comparison !== "edited"}
      className="aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
      onClick={() =>
        preview.setState({
          comparison: comparison === "split" ? "edited" : "split",
        })
      }
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M10 2v16M7 5H3v10h4M13 5h4v10h-4" />
      </svg>
    </IconButton>
  );
}
