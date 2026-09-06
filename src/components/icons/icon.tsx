import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;
export function Icon(props: IconProps) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className="size-5"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		/>
	);
}
