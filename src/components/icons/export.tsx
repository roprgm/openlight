import { Icon, type IconProps } from "./icon";

export function ExportIcon(props: IconProps) {
	return (
		<Icon viewBox="0 0 20 20" {...props}>
			<path d="M10 2v10m-4-4 4 4 4-4M3 12v5h14v-5" />
		</Icon>
	);
}
