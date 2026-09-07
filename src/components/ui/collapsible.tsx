import { type ReactNode, useId, useState } from "react";

/** Accessible disclosure with animated height and keyboard-safe collapsed content. */
export function Collapsible({
	title,
	children,
	defaultOpen = true,
}: {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const id = useId();
	return (
		<section className="shadow-ridge">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen(!open)}
				className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-sm text-neutral-300 transition-colors hover:bg-white/3 hover:text-neutral-100 outline-none focus-visible:bg-white/8 focus-visible:text-white"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					data-open={open}
					className="size-4 shrink-0 text-neutral-500 transition-transform duration-200 ease-out data-[open=true]:rotate-90 motion-reduce:transition-none"
				>
					<path d="m6 4 4 4-4 4" />
				</svg>
				{title}
			</button>
			<div
				id={id}
				inert={!open}
				data-open={open}
				className="invisible grid grid-rows-[0fr] transition-[grid-template-rows,visibility] duration-200 ease-out data-[open=true]:visible data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none"
			>
				<div className="min-h-0 overflow-hidden">
					<div className="px-4 pt-2 pb-4">{children}</div>
				</div>
			</div>
		</section>
	);
}
