import { Icon, type IconProps } from "./icon";

export function LayersIcon(props: IconProps) {
	return (
		<Icon viewBox="0 0 20 20" {...props}>
			<path d="m10 2 7 4-7 4-7-4z" />
			<path d="m3 10 7 4 7-4M3 14l7 4 7-4" />
		</Icon>
	);
}
