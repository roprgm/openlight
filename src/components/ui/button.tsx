import { cn } from "cn";
import type { ComponentProps } from "react";

export default function Button({
	className,
	...props
}: ComponentProps<"button">) {
	return (
		<button
			className={cn(
				"cursor-pointer rounded-lg border border-black bg-neutral-700 px-3 py-2 text-neutral-100 shadow-ridge hover:bg-neutral-600 active:bg-neutral-700 active:shadow-groove focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-400 transition-colors",
				className,
			)}
			type="button"
			{...props}
		/>
	);
}
