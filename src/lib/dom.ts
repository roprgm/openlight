/** Fields that own their keys, so page shortcuts and held keys leave them alone; range and color inputs only pick. */
export const typingFields =
  'input:not([type="range"], [type="color"]), textarea, select, dialog, [role="dialog"]';

/** React portals bubble through the component tree, outside the element's input area. */
export function containsTarget(event: {
  currentTarget: Node;
  target: EventTarget | null;
}) {
  return (
    event.target instanceof Node && event.currentTarget.contains(event.target)
  );
}

export function isTyping(target: EventTarget | null, fields = typingFields) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest(fields) !== null)
  );
}

/**
 * Keeps a menu's or dialog's keys from the page's shortcuts; Escape goes on to the document, where the
 * popup's dismissal listens.
 */
export function keepKeys(event: { key: string; stopPropagation(): void }) {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Saves a file through the browser's download. */
export function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Returns keys to the page, as after a button that started a canvas gesture. */
export function blurActive() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
