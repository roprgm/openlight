import { z } from "zod/mini";
import type { LookupTable } from "@/core/document";

/** Editors write sizes up to 65; two points already span the domain. */
export const lutSizes = [2, 65] as const;

const rgb = z.tuple([z.number(), z.number(), z.number()]);

export const lutSchema = z
  .object({
    size: z.int().check(z.minimum(lutSizes[0]), z.maximum(lutSizes[1])),
    domain: z.tuple([rgb, rgb]),
    table: z.array(z.number()),
  })
  .check(
    z.refine(
      ({ domain: [min, max] }) => min.every((low, i) => low < max[i]),
      "The domain's minimum must be below its maximum",
    ),
    z.refine(
      ({ size, table }) => table.length === 3 * size ** 3,
      "The table needs three values per entry",
    ),
  ) satisfies z.ZodMiniType<LookupTable>;
