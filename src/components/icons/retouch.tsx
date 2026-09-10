import { Icon, type IconProps } from "./icon";

export function RetouchIcon(props: IconProps) {
	return (
		<Icon viewBox="0 0 20 20" {...props}>
			<g transform="rotate(45 10 10)">
				<rect x="6" y="2" width="8" height="16" rx="4" />
				<path d="M6 7h8M6 13h8M8.5 10h.01M11.5 10h.01" />
			</g>
		</Icon>
	);
}
