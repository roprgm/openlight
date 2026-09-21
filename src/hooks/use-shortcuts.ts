import { useEffect, useEffectEvent } from "react";

/** View-scoped keyboard actions. Text fields opt in explicitly. */
export function useShortcuts(
	actions: Record<string, () => void>,
	{ inputs = false } = {},
) {
	const invoke = useEffectEvent((event: KeyboardEvent) => {
		const modifier = event.ctrlKey || event.metaKey ? "mod+" : "";
		const shift = modifier && event.shiftKey ? "shift+" : "";
		if ((event.repeat && !modifier) || event.isComposing || event.altKey) {
			return;
		}
		const target = event.target;
		if (
			!inputs &&
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest(
					'input:not([type="range"]), textarea, select, dialog, [role="dialog"]',
				))
		) {
			return;
		}
		const action = actions[`${modifier}${shift}${event.key.toLowerCase()}`];
		if (action) {
			event.preventDefault();
			action();
		}
	});
	useEffect(() => {
		window.addEventListener("keydown", invoke);
		return () => window.removeEventListener("keydown", invoke);
	}, []);
}
