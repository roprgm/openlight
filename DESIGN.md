# Interface design system

OpenLight uses a small set of shared UI primitives so the editor reads as one application across tools and panels. They come from [`@roprgm/ui`](https://ui.roprgm.com), imported per component as `@roprgm/ui/<name>`, with its theme imported in `src/index.css`; floating parts are built on [Base UI](https://base-ui.com), which owns positioning, focus, dismissal, keyboard navigation, and ARIA. `src/components/ui` keeps only what the library does not provide yet: `TextLink` and `TreeDrag`.

| Component | Use |
| --- | --- |
| `Button`, `IconButton` | Actions. `IconButton` is a ghost icon button whose `label` names it and shows as its tooltip, with an optional `shortcut`; use `size="icon-sm"` in headers, rows, and bars. |
| `Chip` | Pill buttons in the bar over the canvas; `aria-pressed` shows a toggle on. A segmented group is a `fieldset` of chips. |
| `Tooltip` | A hint on hover or focus for any control, with an optional shortcut written as `Mod Z` (⌘ or Ctrl). |
| `Menu`, `MenuItem`, `MenuSeparator`, `Submenu` | Commands such as Duplicate, Move, or Delete, opened from a `trigger` such as an `IconButton`. |
| `Select` | A choice that replaces a current value, with `field` or `pill` trigger. |
| `Popover` | Settings that open beside a `trigger`, such as bar controls that no longer fit. |
| `Slider`, `ScrubInput`, `VerticalSlider` | Numbers. A `Slider` is `panel`, `toolbar`, or `compact`; `format` writes the value and whatever follows its digits reads as the unit. |

## Selection and menus

- Use `Menu` for commands and `Popover` for settings; a menu's arrow keys and typeahead would fight sliders and fields inside it. Menu items close the menu when chosen, and nested choices use a `Submenu` rather than a control inside the menu.
- Use `Select` for a choice that replaces a current value. Its options check the selected one.
- Do not render a native HTML `select` in product UI. Specialized browser pickers such as file and color inputs are allowed when the browser owns behavior OpenLight does not reproduce.
- While a surface is open it owns the keyboard: editor shortcuts pause until it closes.

## Tooltips

- Every icon-only control has a tooltip; use `IconButton` or wrap the control in `Tooltip`. Do not use the native `title` attribute.
- A tooltip names the control in a few words and adds the shortcut beside it; longer guidance belongs in the panel. The canvas shows only brief status, such as an error or a stroke finishing.
- A tooltip is not the accessible name. Keep `aria-label` on icon-only controls; `IconButton` sets it from `label`.
- Text that may be cut short, such as a layer name, shows its tooltip only when truncated.

## Panels

- `EditorPanel` stacks its sections in the order written with a divider between each; `PanelBody` is the section that takes the remaining height, with its `header` fixed above the part that scrolls. `PanelHeader` titles a section and rules it off. The layers section keeps room for three rows and shows, empty, before a document opens. The editing sidebar's order is the JSX in `app/editor/sidebar.tsx`.
- `EditorViewport` is the canvas region: a `ViewportStage` inside it pans and zooms with the image, and other children float over it without panning.

## Panel collections

- Use `ListItem` for selectable rows in editor panels. It owns row height, divider, hover, muted, and selected states.
- A row may compose its own thumbnail, label, compact fields, and action menu. Keep those feature-specific parts with the feature.
- Keep lists flush with the panel edges. Put empty-state copy inside the panel padding rather than padding every populated row.

## Surfaces and controls

- Use shared components for repeated interaction and surface behavior. Keep feature-specific composition in the feature.
- Use Tailwind tokens already present in the shared primitive for color, borders, shadows, focus, and pointer-coarse sizing. A caller chooses a documented variant instead of recreating the surface.
- Anchor viewport-corner controls and messages 12 px from both edges. Tool overlays cover the full viewport; the camera preserves a 24 px margin around fitted content without shrinking that coordinate space.
- Use `Notice` for a message floating over the viewport that must not block editing, such as a storage failure or an offer to recover a draft. Choose its `tone` (status or alert, which sets the ARIA role) and position it with classes, `fixed` over the window or `absolute` inside the editor viewport; pass `actions` for buttons under the message and `onDismiss` when the user may close it.
- Use `TextLink` for an underlined link inside running text. It renders an anchor with `href` and a button otherwise; the `muted` variant stays in the sentence's color for secondary actions such as Forget.
- Use `ScrubInput` for numbers that read as inline text, drag sideways, and accept typing. It hugs its digits and unit and shows a subtly rounded background only while text editing is active.
- Give toolbar slider values an explicit minimum character width (`valueWidth`) when their expected range changes digit count. It counts digits, with the unit after them: percentages reserve three tabular characters, while brush size uses the actual maximum's digit count. Do not guess a global maximum.
- Text uses the global body size. Express hierarchy with weight and color.
