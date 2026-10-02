import svg from "./eyedropper-cursor.svg?raw";

/** An eyedropper cursor that picks at its tip, with a crosshair fallback. */
export const eyedropperCursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 21, crosshair`;
