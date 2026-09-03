import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const button = cva(
	"cursor-pointer rounded-lg border px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-neutral-400",
	{
		variants: {
			variant: {
				default:
					"border-black bg-neutral-700 text-neutral-100 shadow-ridge hover:bg-neutral-600 active:bg-neutral-700 active:shadow-groove",
				ghost:
					"border-transparent text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100 active:bg-neutral-700",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export default function Button({
	className,
	variant,
	...props
}: ComponentProps<"button"> & VariantProps<typeof button>) {
	return (
		<button
			className={cn(button({ variant }), className)}
			type="button"
			{...props}
		/>
	);
}
