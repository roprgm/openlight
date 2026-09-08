# TIFF fixtures

Two synthetic images, generated once with tifffile and imagecodecs. No generator or photo originals are required by the tests.

- `rgb8.tif`: 3×2 RGB, uncompressed strips, untagged sRGB.
- `rgb16-le.tif`: 4×2 RGBA, Deflate with horizontal prediction, unassociated alpha, little-endian samples and a linear Rec.2020 matrix/TRC ICC profile. Its two near-quarter-gray values retain detail lost in 8-bit conversion.

The browser test checks our worker-to-GPU integration against known linear Rec.2020 pixels. TIFF tag parsing is supplied by the MIT `tiff` package.
