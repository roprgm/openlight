import { useEffect, useEffectEvent } from "react";
import { isTyping, typingFields } from "@/lib/dom";

/** View-scoped keyboard actions. Text fields opt in explicitly. */
export function useShortcuts(
  actions: Record<string, () => void>,
  { inputs = false } = {},
) {
  const invoke = useEffectEvent((event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey ? "mod+" : "";
    const shift = modifier && event.shiftKey ? "shift+" : "";
    if ((event.repeat && !modifier) || event.isComposing || event.altKey) {
      return;
    }
    if (window.document.querySelector(":popover-open")) {
      return;
    }
    // Enter on a focused button or link is its activation, not a shortcut.
    const owned =
      event.key === "Enter" ? `${typingFields}, button, a` : typingFields;
    if (!inputs && isTyping(event.target, owned)) {
      return;
    }
    const action = actions[`${modifier}${shift}${event.key.toLowerCase()}`];
    if (action) {
      event.preventDefault();
      action();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", invoke);
    return () => window.removeEventListener("keydown", invoke);
  }, []);
}
