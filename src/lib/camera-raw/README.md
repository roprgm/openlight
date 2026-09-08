# camera-raw

Develops camera raw files into a linear RGB texture, on top of [tiff-gpu](../tiff-gpu/README.md), which reads the container and decompresses the sensor data. Bayer DNG is the first format; internal to OpenLight for now.

## Usage

```ts
import { developDng, prepareDng } from "@/lib/camera-raw";

const image = developDng(gpu, await prepareDng(await file.arrayBuffer()));
// a vgpu Target: rgba16float, linear Rec.2020, oriented and cropped
```

`prepareDng(bytes)` is the CPU half and runs in a worker: it finds the Bayer mosaic among the directories, reads black and white levels, the CFA pattern, the as-shot neutral, the default crop, the orientation, and the color matrix for daylight, and has tiff-gpu decompress the tiles. `developDng(gpu, prepared)` uploads the mosaic as a float texture and runs one pass that demosaics (bilinear), white-balances, clips at the sensor's white, converts camera RGB to linear Rec.2020, and undoes the orientation within the crop.

## Not yet

Linearization tables, linear-raw (demosaiced) DNG, non-2×2 patterns such as X-Trans, opcode lists, lens corrections, and a better demosaic than bilinear. Camera-native formats (ARW, NEF, CR2) need their own codecs in tiff-gpu's table and a per-camera matrix table, which DNG carries in the file.

## Tests

`camera-raw.test.ts` checks the reader's tags and the decoded samples of both fixtures, and under `bun run test:gpu` the developed color of every block, including the rotated and cropped positions.
