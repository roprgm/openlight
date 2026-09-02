import { cn } from "cn";
import type { ComponentProps } from "react";

export default function Spinner({
	className,
	...props
}: ComponentProps<"div">) {
	return (
		<div
			aria-label="Loading"
			className={cn(
				"size-5 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-100",
				className,
			)}
			role="status"
			{...props}
		/>
	);
}
