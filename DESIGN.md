# Interface design system

OpenLight uses a small set of shared UI primitives so the editor reads as one application across tools and panels.

## Selection and menus

- Use `Select` for a choice that replaces a current value. Its trigger may use the panel `field` style or floating-toolbar `pill` style; its options always open on the shared elevated surface.
- Use `Menu` for commands such as Duplicate, Move, or Delete. `Menu` and `Select` both use `MenuSurface`, which owns the anchored popover, border, background, shadow, item hover, dismissal, and keyboard navigation.
- Do not render a native HTML `select` in product UI. Specialized browser pickers such as file and color inputs are allowed when the browser owns behavior OpenLight does not reproduce.
- Put a check beside the selected option. Keep command menus unselected unless the command itself represents a persistent state.

## Panel collections

- Use `PanelListItem` for selectable rows in editor panels. It owns row height, divider, hover, muted, and selected states.
- A row may compose its own thumbnail, label, compact fields, and action menu. Keep those feature-specific parts with the feature.
- Keep lists flush with the panel edges. Put empty-state copy inside the panel padding rather than padding every populated row.

## Surfaces and controls

- Use shared components for repeated interaction and surface behavior. Keep feature-specific composition in the feature.
- Use Tailwind tokens already present in the shared primitive for color, borders, shadows, focus, and pointer-coarse sizing. A caller chooses a documented variant instead of recreating the surface.
- Anchor viewport-corner controls and messages 12 px from both edges. Tool overlays cover the full viewport; the camera preserves a 24 px margin around fitted content without shrinking that coordinate space.
- Use `ScrubInput` for numbers that primarily read as inline text and secondarily accept typing. Inline variants hug the current digits and unit, keep their label close, and show only a subtly rounded background while text editing is active. Reserve the persistent bordered `box` variant for form fields that need explicit input chrome.
- Give toolbar slider values an explicit minimum character width when their expected range changes digit count. Set it at the call site from the useful range: percentages reserve three tabular characters, while brush size uses the actual maximum's digit count. Do not guess a global maximum.
- Text uses the global body size. Express hierarchy with weight and color.
