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

/** Returns keys to the page, as after a button that started a canvas gesture. */
export function blurActive() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
