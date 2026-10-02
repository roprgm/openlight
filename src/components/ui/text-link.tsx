import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const link = cva(
  "cursor-pointer rounded-xs underline underline-offset-4 transition-colors focus-ring",
  {
    variants: {
      /** Default links stand out from their sentence; muted ones stay in its color until hovered. */
      variant: {
        default:
          "text-foreground decoration-disabled hover:decoration-foreground",
        muted:
          "decoration-level-6 hover:text-foreground hover:decoration-secondary",
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
