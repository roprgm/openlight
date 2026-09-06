import { Icon, type IconProps } from "./icon";

export function CropIcon(props: IconProps) {
	return (
		<Icon viewBox="0 0 20 20" {...props}>
			<path d="M5 2v13h13M2 5h13v13" />
		</Icon>
	);
}
