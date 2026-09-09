# TODO

## Evaluate replacing tiff-gpu with raw-webgpu

Keep the current TIFF loader until raw-webgpu covers the TIFF formats already supported by OpenLight and its performance is acceptable.

- Add support for bilevel, palette and float64 TIFF in raw-webgpu. These are the three known coverage regressions in the shared 21-fixture corpus. Both loaders currently reject the YCbCr JPEG fixture.
- Verify reference pixels, ICC color conversion, alpha, orientation, HDR and precision with every TIFF fixture.
- Compare loading time and memory on the large compressed and uncompressed TIFF files in `public/debug`. The measured raw-webgpu path was slower; shared RAW infrastructure alone is not a reason to accept that regression.
- Once coverage and performance are accepted, route TIFF through raw-webgpu and remove the superseded loader and dependencies. Keep the integration small and preserve regression coverage.

The raw-webgpu repository retains `TIFF-BENCHMARK.md` and `DIRECT-BYTES-BENCHMARK.md` with the historical measurements, and provides `bun run test:tiff` and `bun run benchmark:tiff` for verification.
