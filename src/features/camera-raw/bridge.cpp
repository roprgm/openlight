// OpenLight's MIT bridge to unmodified LibRaw 0.22.2, distributed under CDDL 1.0.
#include "libraw/libraw.h"
#include <emscripten/emscripten.h>
#include <cstring>
extern "C" {
EMSCRIPTEN_KEEPALIVE LibRaw* raw_create() { return new LibRaw; }
EMSCRIPTEN_KEEPALIVE void raw_destroy(LibRaw* raw) { delete raw; }
EMSCRIPTEN_KEEPALIVE int raw_open(LibRaw* raw, void* data, unsigned size) {
  return raw->open_buffer(data, size);
}
EMSCRIPTEN_KEEPALIVE int raw_unpack(LibRaw* raw) { return raw->unpack(); }
EMSCRIPTEN_KEEPALIVE void* raw_pixels(LibRaw* raw) { return raw->imgdata.rawdata.raw_image; }
EMSCRIPTEN_KEEPALIVE void* raw_curve(LibRaw* raw) { return raw->imgdata.color.curve; }
// Use LibRaw's identified codec and offset, without parsing Sony's TIFF/MakerNotes again.
EMSCRIPTEN_KEEPALIVE unsigned raw_offset(LibRaw* raw) {
  if (strcmp(raw->unpack_function_name(), "sony_arw2_load_raw()")) { return 0; }
  if (raw->imgdata.sizes.raw_width % 32) { return 0; }
  return raw->get_internal_data_pointer()->unpacker_data.data_offset;
}
EMSCRIPTEN_KEEPALIVE int raw_metadata(LibRaw* raw, float* out) {
  const auto& size = raw->imgdata.sizes;
  const auto& color = raw->imgdata.color;
  const auto& id = raw->imgdata.idata;
  if (!id.filters || id.filters == 9 || id.colors != 3 || color.cblack[4] * color.cblack[5]) { return -1; }
  const float dimensions[] = {float(size.raw_width), float(size.raw_height), float(size.raw_pitch),
    float(size.left_margin), float(size.top_margin), float(size.width), float(size.height), float(size.flip), float(color.maximum)};
  memcpy(out, dimensions, sizeof(dimensions));
  for (int i = 0; i < 4; i++) {
    int site = raw->COLOR(i / 2, i % 2);
    int channel = site;
    if (channel == 3) { channel = 1; }
    out[9 + i] = channel;
    out[13 + i] = color.black + color.cblack[site];
    float gain = color.cam_mul[site];
    if (gain <= 0) { gain = color.cam_mul[channel]; }
    out[17 + i] = gain / color.cam_mul[1];
  }
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
      out[21 + i * 3 + j] = color.rgb_cam[i][j];
      if (j == 1) { out[21 + i * 3 + j] += color.rgb_cam[i][3]; }
      out[30 + i * 3 + j] = color.cam_xyz[i][j];
      if (!color.cam_xyz[0][0]) { out[30 + i * 3 + j] = color.dng_color[0].colormatrix[i][j]; }
    }
  }
  return 0;
}
}
