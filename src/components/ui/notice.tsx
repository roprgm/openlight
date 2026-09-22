import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { CloseIcon } from "@/components/icons/close";
import Button from "./button";

const notice = cva(
  "bottom-3 z-50 flex max-w-sm items-start gap-2 rounded-lg border border-black/60 bg-neutral-800 py-2 pl-3 shadow-float",
  {
    variants: {
      /** Status messages read as ordinary text; alerts are red and interrupt assistive technology. */
      tone: {
        status: "text-neutral-300",
        alert: "text-red-300",
      },
      /** 12 px from the edge, or centered along it. */
      placement: {
        start: "left-3",
        center: "-translate-x-1/2 left-1/2",
      },
      /** Over the whole window, or inside the nearest positioned ancestor such as the editor viewport. */
      anchor: {
        window: "fixed",
        viewport: "absolute",
      },
    },
    defaultVariants: { tone: "status", placement: "center", anchor: "window" },
  },
);

type NoticeProps = ComponentProps<"div"> &
  VariantProps<typeof notice> & {
    /** Buttons shown under the message. */
    actions?: ReactNode;
    onDismiss?: () => void;
  };

/** A message floating over the viewport that doesn't block the editor. */
export function Notice({
  className,
  tone,
  placement,
  anchor,
  actions,
  onDismiss,
  children,
  ...props
}: NoticeProps) {
  return (
    <div
      role={tone === "alert" ? "alert" : "status"}
      className={cn(
        notice({ tone, placement, anchor }),
        onDismiss || "pr-3",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <p>{children}</p>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
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
