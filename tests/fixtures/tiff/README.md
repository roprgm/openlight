# TIFF fixtures

Small synthetic TIFFs are committed directly; tests need no Python tooling. They were created with NumPy, tifffile and imagecodecs. Reference values come from standard sRGB transfer functions and color matrices, independently of WGSL.

Coverage includes 8/16/32-bit unsigned samples, half/float HDR, both byte orders, strips and planar tiles, PackBits/LZW/Deflate, integer and floating predictors, RGB/grayscale ICC matrix/TRC profiles, alpha, orientation, precision and invalid data.

`rgb8-lzw-p3.tif` combines repeated pixels and deterministic noise in one strip to exercise LZW dictionary growth, resets and repeated codes. Its Display P3 primaries exercise explicit color calibration with asymmetric RGB values. The test checks the full decoded-byte hash as well as GPU color samples.

`deflate-overflow.tif` and `deflate-truncated.tif` change the declared width of `hdr-le.tif` so the decompressed strip is too large or too small. The latter also uses the legacy Deflate tag, 32946.
