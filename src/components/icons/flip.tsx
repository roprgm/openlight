import { Icon, type IconProps } from "./icon";

export function FlipIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m15 5 6 7-6 7Z" />
			<path d="M9 5 3 12l6 7Z" fill="currentColor" stroke="none" />
			<path d="M12 3v18" strokeDasharray="0.1 3.5" />
		</Icon>
	);
}
