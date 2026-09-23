import { en } from "zod/locales";
import { z } from "zod/mini";

// zod/mini ships without messages; English keeps errors readable.
z.config(en());

/** Parses `value`, or throws one readable error naming the subject, the first invalid path, and why. */
export function parse<S extends z.ZodMiniType>(
  schema: S,
  value: unknown,
  subject: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const [issue] = result.error.issues;
  const path = issue.path.join(".");
  throw Error(`${subject}${path ? ` ${path}` : ""}: ${issue.message}.`);
}

/** A change to some of an object's fields; unknown fields are rejected. */
export function change<Shape extends z.core.$ZodShape>(
  schema: z.ZodMiniObject<Shape>,
) {
  return z.partial(z.strictObject(schema.shape));
}

/** Missing object fields take their defaults before parsing, as for a file older than a parameter. */
export function withDefaults<S extends z.ZodMiniType>(
  defaults: object,
  schema: S,
) {
  return z.pipe(
    z.transform((value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...defaults, ...value }
        : value,
    ),
    schema,
  );
}

export const range = (min: number, max: number) =>
  z.number().check(z.minimum(min), z.maximum(max));
export const unit = range(0, 1);
export const point = z.tuple([z.number(), z.number()]);
