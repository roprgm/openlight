import svg from "./rotate-cursor.svg?raw";

/** A rotation cursor turned by `angle` degrees, with a crosshair fallback. */
export function rotateCursor(angle = 0) {
  const turned = angle
    ? svg.replace('transform="', `transform="rotate(${angle} 12 12) `)
    : svg;
  return `url("data:image/svg+xml,${encodeURIComponent(turned)}") 12 12, crosshair`;
}
