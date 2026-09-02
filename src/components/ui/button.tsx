import { cn } from "cn";
import type { ComponentProps } from "react";

export default function Button({
	className,
	...props
}: ComponentProps<"button">) {
	return (
		<button
			className={cn(
				"cursor-pointer rounded-lg bg-neutral-100 px-4 py-2.5 text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-400",
				className,
			)}
			type="button"
			{...props}
		/>
	);
}
