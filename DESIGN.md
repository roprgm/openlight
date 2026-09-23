# Interface design system

OpenLight uses a small set of shared UI primitives so the editor reads as one application across tools and panels. They live in `src/components/ui`; floating parts are built on [Base UI](https://base-ui.com), which owns positioning, focus, dismissal, keyboard navigation, and ARIA.

| Component | Use |
| --- | --- |
| `Button`, `IconButton` | Actions. `IconButton` is a ghost icon button whose `label` names it and shows as its tooltip, with an optional `shortcut`. |
| `Chip`, `ChipGroup` | Pill buttons in the bar over the canvas; `aria-pressed` shows a toggle on, and a group is segmented. |
| `Tooltip` | A hint on hover or focus for any control, with an optional shortcut written as `Mod Z` (⌘ or Ctrl). |
| `Menu`, `MenuItem`, `MenuSeparator`, `Submenu` | Commands such as Duplicate, Move, or Delete. |
| `Select` | A choice that replaces a current value, with `field` or `pill` trigger. |
| `Popover` | Settings that open beside a pill, such as bar controls that no longer fit. |
| `Surface` | The elevated panel under every menu, select, and popover; popup parts render as one. |

## Selection and menus

- Use `Menu` for commands and `Popover` for settings; a menu's arrow keys and typeahead would fight sliders and fields inside it. Menu items close the menu when chosen, and nested choices use a `Submenu` rather than a control inside the menu.
- Use `Select` for a choice that replaces a current value. Its options check the selected one.
- Do not render a native HTML `select` in product UI. Specialized browser pickers such as file and color inputs are allowed when the browser owns behavior OpenLight does not reproduce.
- While a surface is open it owns the keyboard: editor shortcuts pause until it closes.

## Tooltips

- Every icon-only control has a tooltip; use `IconButton` or wrap the control in `Tooltip`. Do not use the native `title` attribute.
- A tooltip names the control in a few words and adds the shortcut beside it; longer guidance belongs in the panel or a canvas hint.
- A tooltip is not the accessible name. Keep `aria-label` on icon-only controls; `IconButton` sets it from `label`.
- Text that may be cut short, such as a layer name, shows its tooltip only when truncated.

## Panels

- `EditorPanel` stacks its sections in the order written with a divider between each; `PanelBody` is the section that scrolls, and `PanelHeader` titles a section. The editing sidebar's order is the JSX in `app/editor/sidebar.tsx`.
- `EditorViewport` is the canvas region: a `ViewportStage` inside it pans and zooms with the image, and other children float over it without panning.

## Panel collections

- Use `PanelListItem` for selectable rows in editor panels. It owns row height, divider, hover, muted, and selected states.
- A row may compose its own thumbnail, label, compact fields, and action menu. Keep those feature-specific parts with the feature.
- Keep lists flush with the panel edges. Put empty-state copy inside the panel padding rather than padding every populated row.

## Surfaces and controls

- Use shared components for repeated interaction and surface behavior. Keep feature-specific composition in the feature.
- Use Tailwind tokens already present in the shared primitive for color, borders, shadows, focus, and pointer-coarse sizing. A caller chooses a documented variant instead of recreating the surface.
- Anchor viewport-corner controls and messages 12 px from both edges. Tool overlays cover the full viewport; the camera preserves a 24 px margin around fitted content without shrinking that coordinate space.
- Use `Notice` for a message floating over the viewport that must not block editing, such as a storage failure or an offer to recover a draft. Choose its `tone` (status or alert, which sets the ARIA role), `placement`, and `anchor` (the window, or the editor viewport it renders inside); pass `actions` for buttons under the message and `onDismiss` when the user may close it.
- Use `TextLink` for an underlined link inside running text. It renders an anchor with `href` and a button otherwise; the `muted` variant stays in the sentence's color for secondary actions such as Forget.
- Use `ScrubInput` for numbers that primarily read as inline text and secondarily accept typing. Inline variants hug the current digits and unit, keep their label close, and show only a subtly rounded background while text editing is active. Reserve the persistent bordered `box` variant for form fields that need explicit input chrome.
- Give toolbar slider values an explicit minimum character width when their expected range changes digit count. Set it at the call site from the useful range: percentages reserve three tabular characters, while brush size uses the actual maximum's digit count. Do not guess a global maximum.
- Text uses the global body size. Express hierarchy with weight and color.

## Editor tools

How the rail, canvas bar, sidebar, and layer stack behave. Commands they call are in the [control API](API.md).

The sidebar always shows the output histogram, the selected layer's controls under that layer's name (or Image), and the layer stack; layers and controls scroll independently. The zoom percentage counts image pixels per device pixel: clicking it at fit zooms to 100%, and anywhere else returns to fit. The rail holds tools: **A** Adjust, **B** Brush, **L** Linear gradient, **R** Radial gradient, **H** Healing, and **C** Crop; **E** opens Export from the header. A selected mask is *active*: the sidebar shows its adjustments and the bar its opacity. It is *edited* only while a shape tool is on the rail, which shows its guides or brush and the overlay; Adjust leaves the canvas to pan and zoom. Selecting a mask in the stack arms the tool of its shape; selecting the image or an effect returns to Adjust. **Enter**, or **Escape** with no drag in progress, leaves one level at a time: a shape tool returns to Adjust with the mask still selected, so its sliders stay at hand without guides over the image, and in Adjust the selection climbs to the parent mask, then to the image with its global controls. The shape's key or the mask's row enters editing again. Enter on a focused button stays its click. The bar over the image edits the active tool and the selected layer: the tool's options, then the layer's opacity, Overlay, and a radial mask's Feather or a child mask's operation. It never wraps: when the canvas is narrow it drops the slider bars, then moves the layer options and finally everything into a menu at its end. Dragging with a gradient tool draws a new mask above the selection; the tool stays active, and **Alt** while starting the drag subtracts the gradient from the selected mask instead. Choosing the Brush tool creates an empty brush mask above the selection at once, so adjustments made before the first stroke belong to it; leaving the tool while that mask has no strokes and nothing else changed removes it together with its history entry. A brush stroke paints into the selected brush mask, or starts a new brush mask. Creating inside a mask happens in the layer stack: each root mask row has Add and Subtract menus that choose a shape and nest the next mask inside it, and **Delete** removes the selected layer with any tool. The brush bar sets size, feather, flow, and paint or erase; **[** and **]** resize, holding **Alt** erases and shows Erase pressed, and **Escape** cancels the stroke. On a touch screen a second finger during a stroke cancels it and pinches instead, so painting and zooming never mix. The brush cursor previews the dab's feather and remains visible while Size or Feather is edited. Creating the mask and each stroke are separate undo steps.

**H** enters Healing and creates an empty Healing layer unless one is selected. Each stroke becomes a patch filled from a donor elsewhere in the image. Size sets the next stroke and never resizes an existing patch. Healing keeps its own next-stroke Feather, initially 10%, without changing the Brush tool. A selected patch exposes editable Feather and Opacity; feather softens the accumulated hard-stroke shape inward from its contour rather than expanding it or feathering every dab independently. A stroke whose brush does not reach the image is declined. Healing chooses a nearby donor automatically; **Alt-click** sets it manually, and Automatic source clears the override. Its boundary correction is bounded to avoid extreme color gains and remains independent of Feather and Opacity. A stroke's donor search keeps its history group open, so Size, Feather, or a handle drag started meanwhile joins that stroke's undo step. Each patch receives the visible result of every earlier patch in its layer. The sidebar numbers patches in replay order with each one's brush size and any lowered opacity; drawing, selection, and row hover show their destination contour and first-point anchor. Dragging the destination anchor moves the shape while its source stays fixed. A completed patch also shows a quieter source contour whose anchor moves its donor. **Escape** cancels painting or pending processing; Enter leaves after completion. Leaving an untouched new layer removes it.

The red overlay shows a mask being edited that does not change the image yet: a gradient being drawn, or the selected mask while its adjustments and curve are default and its effects are off. Once the mask applies an effect, the image itself shows it, so painting continues without the tint. The Overlay button shows whether the overlay is visible; it and **O** show or hide the overlay for the selected mask in any tool, until another layer is selected. The tint follows the layer's opacity, which scales the mask's coverage. The curve's input histogram weighs pixels by that coverage, so it describes what the curve affects; it ignores opacity and stays available while the layer is hidden or at zero opacity. Selected masks stay editable: drag the center to move, guides to resize or rotate, and the radial inner handle or Feather slider to soften its edge. Shift constrains drawing; Escape cancels the gesture; Delete/Backspace removes the selected mask. Each gesture is one undo. A new mask shows a red overlay of its coverage until Enter leaves editing or its first adjustment; the overlay also shows while drawing or dragging a guide. Add/Subtract menus accept either gradient shape. **+** adds an effect, inside a selected top-level mask or above the selected sibling. Eye buttons toggle visibility; the inspector edits opacity. Drag a layer name to reorder (insertion line) or nest (highlighted row); the base stays locked and nesting is limited to two levels. Double-click a name to rename; the row menu also duplicates, deletes, reorders, or reparents. Image import still replaces the document; multiple image layers and additional blend modes are not implemented.
