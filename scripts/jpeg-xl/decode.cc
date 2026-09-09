#include <jxl/decode.h>
#include <stdint.h>
#include <stddef.h>

// Decode one TIFF strip/tile. The caller owns both buffers and specifies the TIFF sample scale.
extern "C" int decode(const uint8_t* input, size_t input_size,
                      void* output, size_t output_size, uint32_t width,
                      uint32_t height, uint32_t channels, uint32_t bits,
                      uint32_t floating) {
  JxlDecoder* decoder = JxlDecoderCreate(nullptr);
  if (!decoder) return 1;
  int result = 2;
  JxlPixelFormat format = {channels, floating ? JXL_TYPE_FLOAT : JXL_TYPE_UINT16,
                           JXL_LITTLE_ENDIAN, 0};
  JxlDecoderSetKeepOrientation(decoder, JXL_TRUE);
  JxlDecoderSetRenderSpotcolors(decoder, JXL_FALSE);
  JxlDecoderSubscribeEvents(decoder, JXL_DEC_BASIC_INFO | JXL_DEC_FULL_IMAGE);
  JxlDecoderSetInput(decoder, input, input_size);
  JxlDecoderCloseInput(decoder);
  bool complete = false;
  while (true) {
    JxlDecoderStatus status = JxlDecoderProcessInput(decoder);
    if (status == JXL_DEC_BASIC_INFO) {
      JxlBasicInfo info;
      if (JxlDecoderGetBasicInfo(decoder, &info) != JXL_DEC_SUCCESS) break;
      if (info.xsize != width || info.ysize != height ||
          info.num_color_channels != channels || info.num_extra_channels ||
          info.have_animation || bool(info.exponent_bits_per_sample) != bool(floating)) {
        result = 3;
        break;
      }
    } else if (status == JXL_DEC_NEED_IMAGE_OUT_BUFFER) {
      size_t size = 0;
      if (JxlDecoderImageOutBufferSize(decoder, &format, &size) != JXL_DEC_SUCCESS ||
          size != output_size ||
          JxlDecoderSetImageOutBuffer(decoder, &format, output, size) != JXL_DEC_SUCCESS) {
        result = 3;
        break;
      }
      // Match the TIFF's declared range, rather than scaling N-bit samples to 65535.
      if (!floating) {
        JxlBitDepth depth = {JXL_BIT_DEPTH_CUSTOM, bits, 0};
        if (JxlDecoderSetImageOutBitDepth(decoder, &depth) != JXL_DEC_SUCCESS) break;
      }
    } else if (status == JXL_DEC_FULL_IMAGE) {
      complete = true;
    } else if (status == JXL_DEC_SUCCESS) {
      result = complete ? 0 : 2;
      break;
    } else {
      break;
    }
  }
  JxlDecoderDestroy(decoder);
  return result;
}
