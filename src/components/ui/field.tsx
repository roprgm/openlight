import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

type FieldProps = ComponentProps<"span"> & {
	/** "box" always shows the chrome; "text" reads as plain text until focused. */
	variant?: "box" | "text";
};

const chrome = cva(
	"rounded border px-1 py-0.5 focus-within:ring-1 focus-within:ring-neutral-400/30",
	{
		variants: {
			variant: {
				box: "border-black bg-neutral-900 shadow-groove",
				text: "border-transparent focus-within:border-black focus-within:bg-neutral-900 focus-within:shadow-groove",
			},
		},
	},
);

/**
 * Sunken chrome around a bare form control (input, select, textarea).
 * The child styles itself with `w-full bg-transparent outline-none`.
 */
export function Field({ variant = "box", className, ...props }: FieldProps) {
	return <span className={cn(chrome({ variant }), className)} {...props} />;
}
