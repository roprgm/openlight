# Domain terms

OpenLight edits documents containing image content and adjustments.

| Term | Meaning |
| --- | --- |
| **Document** | An independent editing session with its own canvas, history, and resources. Opening an image creates a document containing that image. |
| **Scene** | The document's serializable content: canvas geometry, image-source references, and adjustments. Files and GPU resources live outside it. |
| **Layer** | A source, effect, or mask in the composition. Image layers own basic adjustments; effects process the image below; masks scope their basic adjustments and child effects. Linear and radial child masks add or subtract coverage. Layers compose render nodes without owning textures. |
| **Image source** | An image used as input to the document's composition. It is content within a document. |
| **Edit** | One reversible content change. A continuous slider or curve drag is one edit, as is importing a set of adjustments. |
| **Workspace** | The open-document session. It currently holds at most one document, replaced when another image is opened. |
| **Mode** | An editor task area: Adjust, Crop, or Export. Switching modes changes tools and panels, not the document. |

Use these names consistently in code, UI text, and documentation.
