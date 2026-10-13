# Domain terms

| Term | Meaning |
| --- | --- |
| **Workspace** | The open-document session; it holds one document, replaced when another image or scene file opens. |
| **Document** | An independent editing session with its own scene, history, and resources. |
| **Scene** | The document's serializable content: frame, image-source references, and layers. Files and GPU resources live outside it. |
| **Image source** | An image the document composes, referenced by ID. |
| **Layer** | A source, effect, or mask in the composition. Effects process the image below; masks scope their adjustments and child effects, and child masks add, subtract, or intersect coverage. |
| **Stroke** | One brush drag: paint or erase, size, feather, flow, and points with pressure in source pixels. |
| **Range** | A mask that selects pixels by lightness or color rather than position. |
| **Healing patch** | One repair in a Healing layer: Heal copies a donor with color correction, Clone copies it as is, Remove synthesizes the area from its surroundings. |
| **Perspective correction** | Vertical and Horizontal keystone in the frame, applied before crop, rotation, and flips. |
| **LUT** | A 3D color lookup table from a `.cube` file, applied by a LUT layer. |
| **Edit** | One reversible content change; a whole gesture is one edit. |
| **Scene file** | A document saved as an `.openlight` archive to continue editing. |
| **Draft** | The latest edited document, kept in the browser to survive closing the tab. |
| **Tool** | What a drag on the canvas does: Brush, Healing, Linear and Radial gradient; Color range picks a range's color from the photo. Adjust pans and zooms. Crop and Export bring their own view. |

Use these names consistently in code, UI text, and documentation.
