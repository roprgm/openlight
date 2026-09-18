# Domain terms

OpenLight edits documents containing image content and adjustments.

| Term | Meaning |
| --- | --- |
| **Document** | An independent editing session with its own canvas, history, and resources. Opening an image creates a document containing that image. |
| **Scene** | The document's serializable content: canvas geometry, image-source references, and adjustments. Files and GPU resources live outside it. |
| **Layer** | Editable content in the composition. The base image owns its Develop settings; effect layers process the result below them, with optional masks and opacity. Layers compose render nodes rather than owning GPU textures. |
| **Image source** | An image used as input to the document's composition. It is content within a document. |
| **Edit** | One reversible content change. A continuous slider or curve drag is one edit, as is importing a set of adjustments. |
| **Workspace** | The open-document session. It currently holds at most one document, replaced when another image is opened. |
| **Mode** | An editor task area: Adjust, Layers, Retouch, Crop, or Export. Switching modes changes tools and panels, not the document. |

Use these names consistently in code, UI text, and documentation.
