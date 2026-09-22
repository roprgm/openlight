# Local recovery

OpenLight keeps the latest edited document in browser IndexedDB. A save starts 1.5 seconds after the first edit, then every 1.5 seconds while edits continue. Writes complete asynchronously. A pending save also starts when the tab is hidden or the document is replaced. Saving does not package a ZIP or render the image. A sudden close before a write finishes can lose the latest unsaved edits.

Database version 1 stores a scene record and original `File` objects keyed by source ID. Scene updates reuse unchanged files; replacing a document removes unreferenced source files in the same transaction. The draft record has a format version so incompatible future content can be rejected rather than silently discarded. Generated binary assets will need a new version and explicit restoration support.

On startup, the empty editor offers a small **Recover** link when a draft exists. Recovery opens it with fresh undo history; **Forget** deletes the local copy. Recovery is stored only in this browser and origin. If storage fails, the editor asks the user to save an editable scene. A portable `.openlight` file remains the durable way to keep or move work.
