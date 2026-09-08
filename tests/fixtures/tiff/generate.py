"""
Synthetic TIFF fixtures and their expected linear Rec.2020 samples (`reference.json`).
Run with numpy, tifffile and imagecodecs: `python3 tests/fixtures/tiff/generate.py`.
"""

import json
import struct
from pathlib import Path

import numpy as np
import tifffile

out = Path(__file__).parent
y, x = np.mgrid[:17, :19]
rgb = np.stack([x * 3000 + 123, y * 3500 + 45, (x + y) * 1700 + 67], -1).astype(np.uint16)
rgb8 = (rgb >> 8).astype(np.uint8)
flat8 = np.full((16, 16, 3), [200, 100, 50], np.uint8)
hdr = np.array([-0.125, 0, 0.18, 0.5, 1, 2, 4], "float32")[None, :, None] * np.ones((3, 1, 3), "float32")
gray = np.full((5, 7), 16384, np.uint16)
rgba = np.empty((5, 7, 4), np.uint16)
rgba[..., :3] = [8192, 16384, 24576]
rgba[..., 3] = 32768
bilevel = (x + y) % 3 == 0
palette = np.stack([np.arange(256) * 257, 65535 - np.arange(256) * 257, np.full(256, 12345)]).astype(np.uint16)
indices = ((x * 7 + y * 11) % 256).astype(np.uint8)
ys, xs = np.mgrid[:130, :200]
strips = np.stack([xs * 300 + 123, ys * 400 + 45, (xs + ys) * 150 + 67], -1).astype(np.uint16)

# Standard color data, independent of the shaders.
d50 = np.array([0.9642, 1, 0.8249])
d65 = np.array([0.95047, 1, 1.08883])
bradford = np.array([[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]])
adaptation = np.linalg.inv(bradford) @ np.diag((bradford @ d65) / (bradford @ d50)) @ bradford
xyz_to_rec2020 = np.array([[1.7166512, -0.3556708, -0.2533663], [-0.6666844, 1.6164812, 0.0157685], [0.0176399, -0.0427706, 0.9421031]])
d50_to_rec2020 = xyz_to_rec2020 @ adaptation
srgb_to_rec2020 = np.array([[0.627404, 0.329283, 0.043313], [0.069097, 0.91954, 0.011362], [0.016391, 0.088013, 0.895595]])
srgb_colorants = np.array([[0.4361, 0.3851, 0.1431], [0.2225, 0.7169, 0.0606], [0.0139, 0.0971, 0.7141]])
prophoto_colorants = np.array([[0.7977, 0.1352, 0.0313], [0.2880, 0.7119, 0.0001], [0.0000, 0.0000, 0.8249]])
gamma = round(1.8 * 256) / 256


def srgb_decode(v):
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def quantize(m):
    return np.round(m * 65536) / 65536


# Minimal matrix/TRC ICC profiles, version 4 layout.
def fixed(v):
    return struct.pack(">i", round(v * 65536))


def xyz(v):
    return b"XYZ " + bytes(4) + b"".join(fixed(c) for c in v)


def curv(values):
    return b"curv" + bytes(4) + struct.pack(">I", len(values)) + b"".join(struct.pack(">H", round(v)) for v in values)


def para(kind, params):
    return b"para" + bytes(4) + struct.pack(">HH", kind, 0) + b"".join(fixed(p) for p in params)


def icc(space, tags):
    header = bytearray(128)
    header[8:12] = b"\x04\0\0\0"
    header[12:16], header[16:20], header[20:24], header[36:40] = b"mntr", space, b"XYZ ", b"acsp"
    header[68:80] = xyz(d50)[8:]
    table, data = struct.pack(">I", len(tags)), b""
    for name, content in tags.items():
        content += bytes(-len(content) % 4)
        table += name + struct.pack(">II", 132 + 12 * len(tags) + len(data), len(content))
        data += content
    struct.pack_into(">I", header, 0, 128 + len(table) + len(data))
    return bytes(header) + table + data


def rgb_icc(colorants, trc):
    return icc(b"RGB ", {b"wtpt": xyz(d50), b"rXYZ": xyz(colorants[:, 0]), b"gXYZ": xyz(colorants[:, 1]), b"bXYZ": xyz(colorants[:, 2]), b"rTRC": trc, b"gTRC": trc, b"bTRC": trc})


srgb_para = para(3, [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045])
srgb_table = curv(srgb_decode(np.arange(256) / 255) * 65535)

fixtures = {
    "rgb16-le.tif": (rgb, dict(byteorder="<", rowsperstrip=5)),
    "rgb16-lzw-be.tif": (rgb, dict(byteorder=">", compression="lzw", rowsperstrip=5)),
    "rgb16-planar-tiled.tif": (rgb.transpose(2, 0, 1), dict(planarconfig="separate", compression="deflate", predictor=2, tile=(16, 16))),
    "rgb16-bigtiff.tif": (rgb, dict(bigtiff=True)),
    "rgb8-packbits.tif": (rgb8, dict(compression="packbits", rowsperstrip=5)),
    "rgb8-jpeg.tif": (flat8, dict(compression="jpeg")),
    "bilevel.tif": (bilevel, dict(photometric="miniswhite")),
    "palette8.tif": (indices, dict(photometric="palette", colormap=palette)),
    "float64.tif": (hdr.astype("float64"), dict()),
    "lzw-strips.tif": (strips, dict(compression="lzw", predictor=2, rowsperstrip=1)),
    "rgb16-prophoto.tif": (rgb, dict(iccprofile=rgb_icc(prophoto_colorants, curv([gamma * 256])))),
    "rgb8-srgb-table.tif": (rgb8, dict(iccprofile=rgb_icc(srgb_colorants, srgb_table))),
    "gray16-para.tif": (gray, dict(photometric="minisblack", iccprofile=icc(b"GRAY", {b"wtpt": xyz(d50), b"kTRC": srgb_para}))),
    "alpha16.tif": (rgba, dict(extrasamples="assocalpha")),
    "orientation-3.tif": (rgb, dict(extratags=[(274, "H", 1, 3, False)])),
    "orientation-6.tif": (rgb, dict(extratags=[(274, "H", 1, 6, False)])),
    "float32-be.tif": (hdr, dict(byteorder=">")),
    "half-predictor.tif": (hdr.astype("float16"), dict(compression="deflate", predictor=3)),
    "precision16.tif": (np.array([[32768, 32800]], np.uint16), dict(photometric="minisblack")),
}
for name, (image, options) in fixtures.items():
    tifffile.imwrite(out / name, image, photometric=options.pop("photometric", "rgb"), metadata=None, **options)


def linear_srgb(encoded):
    return srgb_decode(encoded) @ srgb_to_rec2020.T


def linear_icc(encoded, colorants, curve):
    return curve(encoded) @ (d50_to_rec2020 @ quantize(colorants)).T


reference = []


def record(name, image, points=None, alpha=1, tolerance=0.0007):
    h, w = image.shape[:2]
    points = points or [(0, 0), (w // 2, h // 2), (w - 1, h - 1)]
    reference.append({"name": name, "size": [w, h], "tolerance": tolerance, "points": [{"x": x, "y": y, "rgba": [*image[y, x].tolist(), alpha]} for x, y in points]})


rgb16 = linear_srgb(rgb / 65535)
for name in ["rgb16-le.tif", "rgb16-lzw-be.tif", "rgb16-planar-tiled.tif", "rgb16-bigtiff.tif"]:
    record(name, rgb16, [(0, 0), (1, 3), (16, 15), (18, 16)])
record("rgb8-packbits.tif", linear_srgb(rgb8 / 255))
record("bilevel.tif", np.repeat((~bilevel)[..., None], 3, -1).astype(float))
record("palette8.tif", linear_srgb(palette.T[indices] / 65535))
record("lzw-strips.tif", linear_srgb(strips / 65535), [(0, 0), (77, 33), (199, 129)])
record("rgb16-prophoto.tif", linear_icc(rgb / 65535, prophoto_colorants, lambda e: e**gamma), tolerance=0.002)
record("rgb8-srgb-table.tif", linear_icc(rgb8 / 255, srgb_colorants, lambda e: np.round(srgb_decode(e) * 65535) / 65535))
record("gray16-para.tif", np.full((5, 7, 3), srgb_decode(16384 / 65535)), tolerance=0.002)
record("alpha16.tif", linear_srgb(np.full((5, 7, 3), [0.25, 0.5, 0.75])), alpha=0.5)
record("orientation-3.tif", np.flip(rgb16, (0, 1)))
record("orientation-6.tif", np.rot90(rgb16, -1))
for name in ["float32-be.tif", "half-predictor.tif", "float64.tif"]:
    record(name, hdr, [(x, 1) for x in range(7)], tolerance=0.004)
record("precision16.tif", np.stack([srgb_decode(np.array([[32768, 32800]]) / 65535)] * 3, -1), [(0, 0), (1, 0)])
(out / "reference.json").write_text(json.dumps(reference) + "\n")
print("xyzD50ToRec2020 column-major:", np.round(d50_to_rec2020.T.flatten(), 7).tolist())
