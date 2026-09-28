import { Icon, type IconProps } from "./icon";

export function SparklesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4c.7 3.4 2.6 5.3 6 6-3.4.7-5.3 2.6-6 6-.7-3.4-2.6-5.3-6-6 3.4-.7 5.3-2.6 6-6Z" />
      <path d="M18 2.5c.3 1.3 1.2 2.2 2.5 2.5-1.3.3-2.2 1.2-2.5 2.5-.3-1.3-1.2-2.2-2.5-2.5 1.3-.3 2.2-1.2 2.5-2.5Z" />
      <path d="M18 16c.2 1 .9 1.8 2 2-1.1.2-1.8 1-2 2-.2-1-.9-1.8-2-2 1.1-.2 1.8-1 2-2Z" />
    </Icon>
  );
}
