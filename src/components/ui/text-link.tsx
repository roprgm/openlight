import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const link = cva(
  "cursor-pointer underline underline-offset-4 transition-colors focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-400/80",
  {
    variants: {
      /** Default links stand out from their sentence; muted ones stay in its color until hovered. */
      variant: {
        default:
          "text-neutral-200 decoration-neutral-600 hover:decoration-neutral-200",
        muted:
          "decoration-neutral-700 hover:text-neutral-300 hover:decoration-neutral-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type TextLinkProps = VariantProps<typeof link> &
  (
    | ({ href: string } & ComponentProps<"a">)
    | ({ href?: undefined } & ComponentProps<"button">)
  );

/** An underlined link inside running text: an anchor with `href`, otherwise a button. */
export function TextLink({ className, variant, ...props }: TextLinkProps) {
  const classes = cn(link({ variant }), className);
  if (props.href !== undefined) {
    return <a className={classes} {...props} />;
  }
  return <button className={classes} type="button" {...props} />;
}
