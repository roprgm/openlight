import { Icon, type IconProps } from "./icon";

export function ChevronDownIcon(props: IconProps) {
	return (
		<Icon
			viewBox="0 0 12 12"
			strokeLinecap="butt"
			strokeLinejoin="miter"
			{...props}
		>
			<path d="m3 4.5 3 3 3-3" />
		</Icon>
	);
}
