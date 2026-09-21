# Domain terms

OpenLight edits documents containing image content and adjustments.

| Term | Meaning |
| --- | --- |
| **Document** | An independent editing session with its own canvas, history, and resources. Opening an image creates a document containing that image. |
| **Scene** | The document's serializable content: canvas geometry, image-source references, and adjustments. Files and GPU resources live outside it. |
| **Layer** | A source, effect, or mask in the composition. Image layers own basic adjustments; effects process the image below; masks scope their basic adjustments and child effects. Linear, radial, and brush child masks add or subtract coverage. Layers compose render nodes without owning textures. |
| **Stroke** | One brush drag on a brush mask: paint or erase, size, feather, flow, and points with pressure in source pixels. Strokes are content; the renderer rasterizes them into a cached coverage texture. |
| **Image source** | An image used as input to the document's composition. It is content within a document. |
| **Edit** | One reversible content change. A continuous slider or curve drag is one edit, as is importing a set of adjustments. |
| **Workspace** | The open-document session. It currently holds at most one document, replaced when another image is opened. |
| **Tool** | What a drag on the canvas does: Brush paints, Linear and Radial gradient draw masks and edit the selected gradient's guides, Adjust leaves the canvas to pan and zoom. Crop and Export bring their own view. Switching tools never changes the document or the sidebar. A selected mask is *active*; it is *edited* only while a shape tool is on. |

Use these names consistently in code, UI text, and documentation.
