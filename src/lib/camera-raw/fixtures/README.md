# Fixtures

`bayer.dng` and `bayer-ljpeg.dng` are 64×48 RGGB mosaics of four flat blocks with black 512, white 15000, an as-shot neutral, and a daylight color matrix, written once with a small script. The second uses lossless JPEG tiles, orientation 6, and a default crop. `dng.json` holds each block's developed linear Rec.2020 color, computed independently in numpy.
