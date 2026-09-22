# Editable scene package

An `.openlight` file is a ZIP archive. Version 1 contains `manifest.json` and one `sources/N` entry for each image source referenced by the scene. Source bytes are copied unchanged, including RAW and TIFF files. ZIP entries use stored compression because source formats are commonly compressed already.

```json
{
  "format": "openlight",
  "version": 1,
  "scene": {
    "frame": { "center": [100, 75], "size": [200, 150], "rotation": 0, "angle": 0, "scale": [1, 1] },
    "layers": ["the complete scene layer tree"]
  },
  "assets": [
    {
      "id": "the image layer's source ID",
      "role": "source",
      "name": "photo.raw",
      "mediaType": "image/x-adobe-dng",
      "path": "sources/0"
    }
  ]
}
```

The layer array above is abbreviated; a real package stores every layer field.

`scene` uses the serializable [document scene contract](../src/core/document/scene.ts): geometry, layer order, parameters, masks, brush strokes, and healing patch paths. Each image layer refers to an asset by ID. Asset paths are internal archive names; original filenames are metadata and are never used as archive paths.

Readers accept additional non-content JSON fields within a supported version and validate the required fields they use. Changes to required fields, layer content, or asset roles need a new version and an explicit loader migration. In particular, future generated healing or AI data can live in binary asset entries, referenced by stable IDs from scene content. An older loader must reject a version it cannot preserve rather than silently dropping editable data. Version 1 supports source assets only. Undo history, selection, preview settings, and GPU caches are session state and are not stored.
