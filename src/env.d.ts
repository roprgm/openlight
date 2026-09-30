/// <reference types="vite/client" />
/// <reference types="@vgpu/wgsl/wgsl-types" />

/** Chromium's screen color picker; other browsers lack it. */
interface Window {
  EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
}
