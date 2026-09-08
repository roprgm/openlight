# Camera RAW fixtures

`basic.dng` and `highlights.dng` are synthetic, uncompressed 128×96 Bayer DNGs
created for OpenLight, with explicit ColorMatrix1, AsShotNeutral and sensor levels.
The basic fixture gives 6505 K/+10 tint; its 3000 K export reference was calculated
independently with Colour 0.4.7's Krystek 1985 chromaticity conversion.
The highlights fixture has unequal 3/1/1.5 gains, a saturation ramp, a bright
unsaturated patch and a partially clipped patch. Expected working-space values
come from independent matrix arithmetic, not shader snapshots.

`cameras.json` contains original-file SHA-256 identities and independent reference
patches calculated from LibRaw sensor samples with Colour's Malvar2004 demosaic.
Put the named originals in `OPENLIGHT_RAW_FIXTURES` to run that optional corpus.
