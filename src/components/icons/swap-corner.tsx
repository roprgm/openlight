import { Icon, type IconProps } from "./icon";

export function SwapCornerIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 12 12" strokeWidth="1.25" {...props}>
      <path d="M.625 2.625H3A6.375 6.375 0 0 1 9.375 9v2.375M2.625.625l-2 2 2 2m4.75 4.75 2 2 2-2" />
    </Icon>
  );
}
