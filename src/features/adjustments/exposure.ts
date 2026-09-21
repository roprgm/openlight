import { node } from "@/core/renderer";
import shader from "./exposure.wgsl";

export function exposure(name: string, value: number) {
  if (value === 0) {
    return;
  }
  return node(name, shader, { set: { exposure: value } });
}
