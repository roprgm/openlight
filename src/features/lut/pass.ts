import type { LookupTable } from "@/core/document";
import { node } from "@/core/renderer";
import shader from "./lut.wgsl";

/** One array per table, so the graph uploads a table once rather than on every render. */
const uploads = new WeakMap<readonly number[], Float32Array<ArrayBuffer>>();

function tableData(table: readonly number[]) {
  let data = uploads.get(table);
  if (!data) {
    data = new Float32Array(table);
    uploads.set(table, data);
  }
  return data;
}

export function lut(lut: LookupTable, name = "lut") {
  return node(name, shader, {
    set: {
      params: {
        size: lut.size,
        domainMin: lut.domain[0],
        domainMax: lut.domain[1],
      },
    },
    storage: { table: tableData(lut.table) },
  });
}
