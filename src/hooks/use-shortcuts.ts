import { useEffect, useEffectEvent } from "react";
import { isTyping, typingFields } from "@/lib/dom";

/** Keys whose shifted character depends on the layout, named by the key itself so Shift combines with them. */
const shiftable: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [`Digit${digit}`, `${digit}`]),
  ),
};

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
    // An open menu, select, or popover owns the keyboard.
    if (window.document.querySelector("[data-surface][data-open]")) {
      return;
    }
    // Enter on a focused button or link is its activation, not a shortcut.
    const owned =
      event.key === "Enter" ? `${typingFields}, button, a` : typingFields;
    if (!inputs && isTyping(event.target, owned)) {
      return;
    }
    const shifted = event.shiftKey && !modifier && shiftable[event.code];
    const name = shifted
      ? `shift+${shifted}`
      : `${modifier}${shift}${event.key.toLowerCase()}`;
    const action = actions[name];
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
