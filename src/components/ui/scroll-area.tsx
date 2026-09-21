import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import type { ComponentProps } from "react";

type ScrollAreaProps = ComponentProps<"div"> & {
  /** Shade an edge while content is clipped beyond it. */
  fade?: boolean;
};

export function ScrollArea({
  children,
  className,
  fade = false,
  ...props
}: ScrollAreaProps) {
  return (
    <Primitive.Root
      className={cn("relative min-h-0 overflow-hidden", className)}
      {...props}
    >
      <Primitive.Viewport
        className={cn(
          "h-full overscroll-contain focus-visible:outline focus-visible:outline-neutral-500 focus-visible:-outline-offset-1",
          fade &&
            "before:pointer-events-none before:sticky before:top-0 before:z-10 before:-mb-6 before:block before:h-6 before:bg-linear-to-b before:from-black/40 before:opacity-0 before:transition-opacity data-overflow-y-start:before:opacity-100 after:pointer-events-none after:sticky after:bottom-0 after:z-10 after:-mt-6 after:block after:h-6 after:bg-linear-to-t after:from-black/40 after:opacity-0 after:transition-opacity data-overflow-y-end:after:opacity-100",
        )}
      >
        <Primitive.Content style={{ minWidth: 0 }}>
          {children}
        </Primitive.Content>
      </Primitive.Viewport>
      <Primitive.Scrollbar className="group z-10 my-1 mr-px flex w-1.5 justify-center">
        <Primitive.Thumb className="w-1 rounded-full bg-neutral-400/60 group-hover:bg-neutral-300 group-data-scrolling:bg-neutral-300" />
      </Primitive.Scrollbar>
    </Primitive.Root>
  );
}
