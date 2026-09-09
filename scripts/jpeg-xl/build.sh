#!/usr/bin/env bash
# Requires CMake, Git, and Emscripten 6.0.9 on PATH. Build output is committed for browser deployment.
set -euo pipefail
project_root=$(cd "$(dirname "$0")/../.." && pwd)
build_root=${1:-$(mktemp -d)}
source_root="$build_root/libjxl"
revision=a7a9c787341cf703dede03c2009fa460cae5e5df # libjxl v0.12.0
if [[ ! -d "$source_root" ]]; then
  git clone --depth 1 --branch v0.12.0 https://github.com/libjxl/libjxl.git "$source_root"
fi
[[ $(git -C "$source_root" rev-parse HEAD) == "$revision" ]]
git -C "$source_root" submodule update --init --depth 1 third_party/brotli third_party/highway third_party/skcms
build="$source_root/build-wasm"
emcmake cmake -S "$source_root" -B "$build" -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_TOOLS=OFF \
  -DJPEGXL_ENABLE_DEVTOOLS=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_MANPAGES=OFF \
  -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF -DJPEGXL_ENABLE_JNI=OFF \
  -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_SKCMS=ON \
  -DJPEGXL_ENABLE_WASM_THREADS=OFF -DJPEGXL_ENABLE_TRANSCODE_JPEG=OFF \
  -DJPEGXL_ENABLE_LTO=ON -DJPEGXL_BUNDLE_LIBPNG=OFF \
  -DCMAKE_C_FLAGS=-msimd128 -DCMAKE_CXX_FLAGS=-msimd128
cmake --build "$build" --target jxl_dec -j "${JOBS:-4}"
output="$project_root/src/lib/tiff-gpu/jpeg-xl"
em++ "$project_root/scripts/jpeg-xl/decode.cc" "$build/lib/libjxl_dec.a" \
  "$build/third_party/highway/libhwy.a" "$build/third_party/brotli/libbrotlidec.a" \
  "$build/third_party/brotli/libbrotlicommon.a" \
  -I"$source_root/lib/include" -I"$build/lib/include" -DJXL_STATIC_DEFINE \
  -O3 -flto -msimd128 --no-entry -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=2147483648 \
  -sFILESYSTEM=0 -sINCOMING_MODULE_JS_API='["wasmBinary"]' -sEXPORTED_FUNCTIONS='["_decode","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o "$output/decoder.js"
chmod 644 "$output/decoder.js" "$output/decoder.wasm"
