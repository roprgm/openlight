# Domain terms

OpenLight edits documents containing image content and adjustments.

| Term | Meaning |
| --- | --- |
| **Document** | An independent editing session with its own canvas, history, and resources. Opening an image creates a document containing that image. |
| **Scene** | The document's serializable content: canvas geometry, image-source references, and adjustments. Files and GPU resources live outside it. |
| **Layer** | A source, effect, or mask in the composition. Image layers own basic adjustments; effects process the image below; masks scope their basic adjustments and child effects. Linear, radial, and brush child masks add or subtract coverage. Layers compose render nodes without owning textures. |
| **Stroke** | One brush drag: paint or erase, size, feather, flow, and points with pressure in source pixels. Strokes are content; the renderer rasterizes them into a cached coverage texture. A Healing patch stores a hard stroke and feathers its accumulated shape separately. |
| **Healing patch** | One painted, non-destructive repair in a Healing layer. It copies a nearby donor, found automatically or set by hand, with a bounded boundary color correction. Patches replay in order and each sees the result of the preceding patches. Size belongs to the recorded hard stroke; feather and opacity remain editable on its accumulated shape. |
| **Image source** | An image used as input to the document's composition. It is content within a document. |
| **Edit** | One reversible content change. A continuous slider or curve drag is one edit, as is importing a set of adjustments. |
| **Scene file** | A document saved as an `.openlight` archive: its scene and the original source files. Opening it creates a document that continues editing; history and preview settings are not saved. |
| **Workspace** | The open-document session. It currently holds at most one document, replaced when another image or scene file is opened. |
| **Tool** | What a drag on the canvas does: Brush paints, Healing repairs, and Linear and Radial gradient draw masks and edit the selected gradient's guides. Adjust leaves the canvas to pan and zoom. Crop and Export bring their own view. Switching tools never changes the sidebar; Brush and Healing create their layer on entry and remove it again if it leaves untouched. A selected mask is *active*; it is *edited* only while a shape tool is on. |

Use these names consistently in code, UI text, and documentation.
