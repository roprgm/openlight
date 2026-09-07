import { Icon, type IconProps } from "./icon";

export function RotateIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M4 12a8 8 0 0 1 14-5" />
			<path d="M20 3v6h-6z" fill="currentColor" stroke="none" />
			<path d="M4 12a8 8 0 0 0 16 0" strokeDasharray="0.1 3.5" />
		</Icon>
	);
}
