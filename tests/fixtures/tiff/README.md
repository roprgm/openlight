# TIFF fixtures

Synthetic images written by `generate.py` with NumPy, tifffile and imagecodecs, together with `reference.json`: their expected linear Rec.2020 samples, computed from standard sRGB and ICC color math rather than from the shaders.

Coverage: 1/8/16-bit and 16/32/64-bit float samples, both byte orders, strips, planar tiles, BigTIFF, PackBits, LZW, Deflate, integer and floating-point predictors, palette, matrix/TRC ICC profiles (gamma, table and parametric curves, RGB and gray), associated alpha, orientation, a many-strip LZW file for the GPU codec, a 16-bit precision step, and a JPEG file the decoder must reject.
