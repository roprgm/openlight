# RAW fixtures

These two synthetic MIT-licensed fixtures are copied unchanged from [raw-webgpu](https://github.com/roprgm/raw-webgpu/tree/7aa3573e23c1cfd71cb4f7227beff82484a9d1fd/tests/fixtures), which owns their generator and codec tests. They contain no camera photographs.

`bayer.dng` stores RGGB samples; `linear-jxl.dng` stores equivalent linear RGB with JPEG XL compression. Both use an sRGB-like camera profile, samples `[32768, 16384, 8192]`, white level 65535 and orientation 6. Expected output is 96×128 with sRGB pixels approximately `[188, 137, 99]`.

OpenLight tests loading, white-balance edits, preview/export agreement, history and resource lifetime with these files.
