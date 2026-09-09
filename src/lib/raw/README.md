# Camera RAW loading

`index.ts` adapts a `raw-webgpu` source to OpenLight's document and renderer lifetimes. The package owns the native decoder, worker, sensor texture, camera calibration and GPU development. OpenLight owns its working targets, preview/export passes and history.

The local dependency is linked from `~/code/raw-webgpu`. Build that package first to generate its WASM and workers; building OpenLight then consumes those artifacts without compiling C++. For native source, supported layouts, fixtures and rebuild instructions, see the package README.

Temperature/tint changes request only gains and a matrix. Each renderer keeps an independent development pass and reruns it only when calibration changes. Export retains the source until encoding finishes. The editor's exposure response remains after RAW development.

Bayer and X-Trans demosaic run on GPU. X-Trans caches camera RGB once for fast white-balance edits; its current interpolation softens fine detail and uses additional GPU memory. Special sensor layouts and mandatory DNG corrections use library CPU preparation. Some files use daylight calibration when camera white balance is unavailable. See the package README for these limitations and the planned X-Trans quality improvement.
