# Interface design

## UI library

Use [`@roprgm/ui`](https://ui.roprgm.com) for standard controls, imported as `@roprgm/ui/<name>`. Its theme is loaded in `src/index.css`. The library owns their appearance and interaction; use its defaults and supported variants. Consult the installed component API when choosing props.

Choose `Button` or `IconButton` for actions, `Menu` for commands, `Popover` for settings, and `Select` for choices. Use the library's other primitives wherever they cover the interaction.

Keep styling overrides specific to an editor requirement demonstrated by the task. An existing override is not a rule to copy onto other controls.

## Editor composition

The photo editor has layouts and interactions the library does not provide. Reuse the existing editor components and compose library primitives inside them:

- `EditorPanel`, `PanelBody`, and `PanelHeader` organize the desktop sidebar.
- `EditorViewport` and `ViewportStage` separate the image from overlays that stay fixed in the viewport.
- Features describe numeric controls as `Parameter`s, rendered as library sliders on desktop and local dials in the mobile dock. Reuse `DockControls`, `DockChips`, and `DialRow` for that composition.
- Layer rows use `ListItem` with their own thumbnails, controls, and drag behavior.

Keep editor-specific controls with their feature. `src/components/ui` holds shared interactions missing from the library, such as `Dial`, `TreeDrag`, and `TextLink`. Add a local component only when existing primitives cannot provide the required behavior.

See [ARCHITECTURE.md](ARCHITECTURE.md#layouts) for layout ownership and [REVIEW.md](REVIEW.md#verify) for visual verification of UI changes.
