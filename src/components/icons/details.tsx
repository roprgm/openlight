import { Icon, type IconProps } from "./icon";

export function DetailsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 18 8-14 8 14H4Zm8-8v6" />
    </Icon>
  );
}
