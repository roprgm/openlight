/** Fields that own their keys, so page shortcuts and held keys leave them alone. */
export const typingFields =
  'input:not([type="range"]), textarea, select, dialog, [role="dialog"]';

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
