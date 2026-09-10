import { Icon, type IconProps } from "./icon";

export function AdjustIcon(props: IconProps) {
	return (
		<Icon viewBox="0 0 20 20" {...props}>
			<path d="M3 5h7M14 5h3M12 3v4M3 10h3M10 10h7M8 8v4M3 15h8M15 15h2M13 13v4" />
		</Icon>
	);
}
