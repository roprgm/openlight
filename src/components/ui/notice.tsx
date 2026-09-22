import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { CloseIcon } from "@/components/icons/close";
import Button from "./button";

const notice = cva(
  "fixed bottom-3 z-50 flex max-w-sm items-start gap-2 rounded-lg border border-black/60 bg-neutral-800 py-2 pl-3 shadow-float",
  {
    variants: {
      /** Status messages read as ordinary text; alerts are red and interrupt assistive technology. */
      tone: {
        status: "text-neutral-300",
        alert: "text-red-300",
      },
      /** 12 px from the viewport's edge, or centered along it. */
      placement: {
        start: "left-3",
        center: "-translate-x-1/2 left-1/2",
      },
    },
    defaultVariants: { tone: "status", placement: "center" },
  },
);

type NoticeProps = ComponentProps<"div"> &
  VariantProps<typeof notice> & { onDismiss?: () => void };

/** A message floating over the viewport that doesn't block the editor. */
export function Notice({
  className,
  tone,
  placement,
  onDismiss,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      role={tone === "alert" ? "alert" : "status"}
      className={cn(
        notice({ tone, placement }),
        onDismiss || "pr-3",
        className,
      )}
      {...props}
    >
      <p>{children}</p>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          className="mr-1"
          onClick={onDismiss}
        >
          <CloseIcon />
        </Button>
      )}
    </div>
  );
}
