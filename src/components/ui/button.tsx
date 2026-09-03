import { cn } from "cn";
import type { ComponentProps } from "react";

export default function Button({
	className,
	...props
}: ComponentProps<"button">) {
	return (
		<button
			className={cn(
				"cursor-pointer rounded border border-black bg-neutral-700 px-4 py-2.5 text-neutral-100 shadow-ridge hover:bg-neutral-600 active:bg-neutral-800 active:shadow-groove focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-400",
				className,
			)}
			type="button"
			{...props}
		/>
	);
}
