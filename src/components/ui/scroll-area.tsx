import { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";
import type { ComponentProps } from "react";

type ScrollAreaProps = ComponentProps<"div"> & {
	viewportClassName?: string;
};

export function ScrollArea({
	children,
	className,
	viewportClassName,
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
					viewportClassName,
				)}
			>
				<Primitive.Content className="pr-2" style={{ minWidth: 0 }}>
					{children}
				</Primitive.Content>
			</Primitive.Viewport>
			<Primitive.Scrollbar className="group z-10 my-1 flex w-2 justify-center">
				<Primitive.Thumb className="w-1 rounded-full bg-neutral-500/40 group-hover:bg-neutral-500/70 group-data-scrolling:bg-neutral-500/70" />
			</Primitive.Scrollbar>
		</Primitive.Root>
	);
}
