import { Icon, type IconProps } from "./icon";

export function SwapIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="M5 11V9a3 3 0 0 1 3-3h7m-2-2 2 2-2 2M15 9v2a3 3 0 0 1-3 3H5m2 2-2-2 2-2" />
    </Icon>
  );
}
