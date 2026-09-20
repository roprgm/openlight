import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import type { ComponentProps } from "react";

type ScrollAreaProps = ComponentProps<"div"> & {
	viewportClassName?: string;
	/** Fade the content toward an edge while more of it is clipped there. */
	fade?: boolean;
};

export function ScrollArea({
	children,
	className,
	viewportClassName,
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
						"[--fade-bottom:min(calc(var(--scroll-area-overflow-y-end,0)*1px),1.5rem)] [--fade-top:min(calc(var(--scroll-area-overflow-y-start,0)*1px),1.5rem)] [mask-image:linear-gradient(to_bottom,transparent,black_var(--fade-top),black_calc(100%-var(--fade-bottom)),transparent)]",
					viewportClassName,
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
