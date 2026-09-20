import type { ReactNode } from "react";

/** Identity on the left, document actions on the right; present in every editor state. */
export function EditorHeader({
	file,
	children,
}: {
	file?: string;
	children?: ReactNode;
}) {
	return (
		<header className="flex h-10 shrink-0 items-center gap-3 border-black border-b bg-panel px-3 shadow-ridge">
			<img src="/logo.svg" alt="" className="size-5" />
			<span className="font-medium text-neutral-200 text-sm">OpenLight</span>
			{file && (
				<span
					className="min-w-0 truncate text-neutral-500 text-sm"
					title={file}
				>
					{file}
				</span>
			)}
			<div className="ml-auto flex items-center gap-1">{children}</div>
		</header>
	);
}
