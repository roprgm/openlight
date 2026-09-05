# OpenLight

OpenLight edits documents containing image content and adjustments.

## Language

**Document**:
An independent editing session with its own canvas and history. Opening an image creates a document containing that image.
_Avoid_: Image, input file, scene

**Scene**:
The current content of a document, including its canvas dimensions and ordered layers.
_Avoid_: Open file, texture

**Image layer**:
An image source placed in the document's stack, with its own adjustments, tone curve, visibility, and opacity. Multiple layers form the document's composition.

**Selected layer**:
The layer targeted by the editing controls. Selecting a layer does not change document content.

**Image source**:
An image used as input to a document's composition. It is content within the document, not the document itself.

**Edit**:
One reversible change to document content. A continuous slider or curve drag is one edit, as is importing a set of adjustments.

**Workspace**:
The application's open-document session. It currently contains at most one document, replaced when another image is opened.
