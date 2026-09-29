import type { LookupTable } from "@/core/image/lut";
import { node } from "@/core/renderer";
import shader from "./lut.wgsl";

export function lut(table: LookupTable, name = "lut") {
  return node(name, shader, {
    set: {
      params: {
        size: table.size,
        domainMin: table.domain[0],
        domainMax: table.domain[1],
      },
    },
    storage: { table: table.table },
  });
}
