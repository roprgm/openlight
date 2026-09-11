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
with sigma 250, using `random.Random(1410)` in row/pixel order. These fixtures
are generated test data, with no external image licensing requirement.


`denoise-clean.correlated.png` and `denoise-noisy.correlated.png` are generated
257×193 RGB8 images representing a night scene: smooth sky, window rows, a
red/green boundary, luminance stripes of amplitude 12 and period 8 pixels, and
a 3×3 red light. The odd dimensions also exercise pyramid edge handling.

The noisy copy adds independent RGB grain (sigma 3) and two independent
opponent-color noise fields (sigma 10 each). Each color field is Gaussian white
noise convolved with a separable Gaussian of spatial sigma 2, radius 6, normalized
by the kernel's L2 norm. The generator uses Python `random.Random(911)`; fields
are generated first, then grain in row/pixel/channel order. Their mixture models
fine grain plus spatially correlated color noise, without depending on a camera
codec. These images are test data generated for OpenLight.
