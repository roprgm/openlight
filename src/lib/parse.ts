import { z } from "zod";

/** Parses `value`, or throws one readable error naming the subject, the first invalid path, and why. */
export function parse<S extends z.ZodType>(
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

/** Missing object fields take their defaults before parsing, as for a file older than a parameter. */
export function withDefaults<S extends z.ZodType>(defaults: object, schema: S) {
  return z.preprocess(
    (value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...defaults, ...value }
        : value,
    schema,
  );
}

export const unit = z.number().min(0).max(1);
export const point = z.tuple([z.number(), z.number()]);
