# Denoising fixtures

`denoise-clean.png` and `denoise-noisy.png` are 401×49 RGBA8 images with two
color patches, a sharp boundary at x=196, and fine sinusoidal stripes below y=32.
The left eight columns have alpha 128. The noisy copy adds Gaussian noise with
sigma 10 using the LCG `seed = (1664525 * seed + 1013904223) mod 2^32`, starting
at 42, and the Box–Muller transform in row/pixel/channel order. The width crosses
the denoiser's 384-pixel tile boundary. These are stored fixtures, not generated
inside the test.

`denoise-clean.tif` and `denoise-noisy.tif` are 64×48 uncompressed RGB16 TIFFs
with two flat color patches. Clean values are `[18000, 21000, 25000]` on the left
and `[30000, 24000, 20000]` on the right. The noisy copy adds rounded Gaussian
noise with sigma 1500, using Python's `random.Random(1409)` in row/pixel/channel order.

`denoise-clean.dng` and `denoise-noisy.dng` retain the tags of the synthetic
earlier OpenLight Bayer DNG test fixture. Their 64×48 mosaic contains two
neutral patches, sensor-linear 0.3 and 0.5, using the tagged black/white levels
512/15000 and neutral `[0.5, 1, 0.7]`. The noisy copy adds rounded Gaussian noise
with sigma 250, using `random.Random(1410)` in row/pixel order. All four fixtures
are generated test data, with no external image licensing requirement.
