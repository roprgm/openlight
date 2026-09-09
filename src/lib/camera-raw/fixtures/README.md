# Fixtures

`bayer.dng` and `bayer-ljpeg.dng` are 64×48 RGGB mosaics of four flat blocks with black 512, white 15000, an as-shot neutral, and a daylight color matrix, written once with a small script. The second uses lossless JPEG tiles, orientation 6, and a default crop. `dng.json` holds each block's developed linear Rec.2020 color, computed independently in numpy.

`linear.dng` and `linear-ljpeg.dng` are original synthetic 16×12 RGB checkerboards. A reduced RGB preview is the primary IFD; the full LinearRaw image is in a SubIFD. They use a 4096-entry quadratic linearization table, channel black levels [64, 128, 256], white 16383, neutral [0.5, 1, 0.7], an identity XYZ-to-camera matrix, orientation 6, and a crop yielding 8×12 pixels. The second stores the same 12-bit codes in an interleaved SOF3 lossless JPEG stream (predictor 1, point transform 0, no restart markers). `linear.json` contains independently calculated normalized and developed colors. These are test data created for this repository, not photographs or third-party assets.

`linear-jxl.dng` contains the same original RGB checkerboard as `linear.dng`, encoded losslessly with native libjxl 0.11.1 into a JPEG XL codestream. Its DNG version is 1.7.1 and compression is 52546. It shares the independent `linear.json` pixel reference.
