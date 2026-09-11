# Denoising fixtures

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
