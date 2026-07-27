"""
P0 Unit 11 helper — decode the CDSE FLOAT32 GeoTIFF into flat band arrays.

Uses Python `tifffile` rather than adding an npm raster dependency for a spike. The runtime
dependency count stays where the ADR put it; this is a dev-only tool alongside `exactextract`.

Writes bands as three consecutive float32 blocks (red, nir, scl) so the TypeScript side can view
them with zero-copy subarrays.

Run:  python3 scripts/gis-p0-decode-tif.py <in.tif> <out.bin> <out-meta.json>
"""
import json
import sys

import numpy as np
import tifffile


def main():
    if len(sys.argv) < 4:
        print("usage: gis-p0-decode-tif.py <in.tif> <out.bin> <out-meta.json>", file=sys.stderr)
        return 2

    arr = tifffile.imread(sys.argv[1])
    arr = np.asarray(arr)

    # Expect (height, width, bands) for an interleaved 3-band raster; tolerate (bands, h, w).
    if arr.ndim == 2:
        arr = arr[:, :, np.newaxis]
    if arr.shape[0] <= 4 and arr.shape[-1] > 4:
        arr = np.transpose(arr, (1, 2, 0))

    height, width, bands = arr.shape
    if bands < 3:
        raise SystemExit(f"expected 3 bands (B04, B08, SCL), got {bands}")

    out = np.empty(3 * height * width, dtype="float32")
    n = height * width
    for b in range(3):
        out[b * n : (b + 1) * n] = arr[:, :, b].astype("float32").ravel()

    out.tofile(sys.argv[2])
    with open(sys.argv[3], "w", encoding="utf-8") as fh:
        json.dump({"width": int(width), "height": int(height), "bands": int(bands), "dtype": str(arr.dtype)}, fh)

    finite = np.isfinite(arr[:, :, 0])
    print(
        f"tifffile decoded {width}x{height}x{bands} {arr.dtype}; "
        f"B04 range [{np.nanmin(arr[:, :, 0][finite]):.4f}, {np.nanmax(arr[:, :, 0][finite]):.4f}], "
        f"SCL classes {sorted(set(np.unique(arr[:, :, 2]).astype(int).tolist()))[:12]}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
