#!/usr/bin/env python3
"""Export only public humidity derivatives from the current SharedDB 1 km asset.

The SharedDB source is read-only. Station information and local source paths are
not included in the published files. Existing climate tiles are not rewritten.
"""

from __future__ import annotations

import argparse
import gzip
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from build_japan_1km import (
    COLORS, MISSING, MONTH_DAYS, OUT, colors_for, current_snapshot,
    mesh_bounds, project_x, project_y,
)


def write_gzip(path: Path, payload: bytes) -> None:
    with path.open("wb") as target:
        with gzip.GzipFile(filename="", mode="wb", fileobj=target, compresslevel=6, mtime=0) as stream:
            stream.write(payload)


def monthly_map(matrix: np.ndarray) -> np.ndarray:
    """Return 12 monthly and one annual mean in 0.1 percentage points."""
    result = np.full((13, matrix.shape[0]), MISSING, dtype="<i2")
    offset = 0
    annual_sum = np.zeros(matrix.shape[0], dtype=np.int32)
    annual_valid = np.ones(matrix.shape[0], dtype=bool)
    for month_index, days in enumerate(MONTH_DAYS):
        month = matrix[:, offset:offset + days]
        if month_index == 1:
            month = month[:, :28]  # February 29 is an eight-year normal, not an ordinary day.
        valid = np.all(month != MISSING, axis=1)
        total = np.where(month != MISSING, month.astype(np.int32), 0).sum(axis=1)
        result[month_index] = np.where(valid, np.rint(total / month.shape[1]), MISSING)
        annual_sum += total
        annual_valid &= valid
        offset += days
    result[12] = np.where(annual_valid, np.rint(annual_sum / 365), MISSING)
    return result


def write_overviews(codes: np.ndarray, map_values: np.ndarray) -> None:
    west, south, east, north = mesh_bounds(codes)
    left = np.floor(project_x(west)).astype(np.int32)
    right = np.ceil(project_x(east)).astype(np.int32)
    top = np.floor(project_y(north)).astype(np.int32)
    bottom = np.ceil(project_y(south)).astype(np.int32)
    for period in range(13):
        values = map_values[period]
        palette = colors_for(values.astype(np.float32) / 10, COLORS["humidity"])
        image = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        for index in np.flatnonzero(values != MISSING):
            draw.rectangle((int(left[index]), int(top[index]), int(right[index]), int(bottom[index])),
                           fill=(*map(int, palette[index]), 255))
        suffix = "annual" if period == 12 else f"{period + 1:02d}"
        image.save(OUT / f"overview-humidity-{suffix}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shared-root", type=Path, required=True)
    args = parser.parse_args()
    shared = args.shared_root.resolve()
    source = current_snapshot(shared, "daily-humidity-normals-1km")
    existing = current_snapshot(shared, "daily-climate-normals-1km")
    with np.load(source / "grid.npz") as grid, np.load(existing / "grid.npz") as climate_grid:
        codes = grid["mesh_codes"]
        if len(codes) != 387_717 or not np.array_equal(codes, climate_grid["mesh_codes"]):
            raise RuntimeError("humidity grid differs from the existing 1 km grid")

    groups = {}
    for prefix in np.unique(codes // 10_000):
        indices = np.flatnonzero(codes // 10_000 == prefix)
        groups[int(prefix)] = indices[np.argsort(codes[indices])]
    months = []
    for month, days in enumerate(MONTH_DAYS, 1):
        with np.load(source / f"humidity-{month:02d}.npz") as data:
            block = data["value_deci_percent"]
            if block.shape != (days, len(codes)) or block.dtype != np.dtype("int16"):
                raise RuntimeError(f"humidity-{month:02d}: invalid matrix")
            if np.any((block != MISSING) & ((block < 0) | (block > 1000))):
                raise RuntimeError(f"humidity-{month:02d}: out-of-range value")
            months.append(block)

    OUT.mkdir(parents=True, exist_ok=True)
    overview_values = np.full((13, len(codes)), MISSING, dtype="<i2")
    for prefix, indices in groups.items():
        matrix = np.concatenate([month[:, indices].T for month in months], axis=1).astype("<i2")
        if matrix.shape != (len(indices), 366):
            raise RuntimeError(f"humidity-{prefix}: invalid daily matrix")
        values = monthly_map(matrix)
        sorted_codes = codes[indices].astype("<u4")
        write_gzip(OUT / f"daily-humidity-{prefix}.bin.gz", matrix.tobytes(order="C"))
        write_gzip(OUT / f"map-humidity-{prefix}.bin.gz",
                   sorted_codes.tobytes() + values.tobytes(order="C"))
        overview_values[:, indices] = values
    write_overviews(codes, overview_values)
    print(f"exported humidity for {len(codes)} cells in {len(groups)} prefixes", flush=True)


if __name__ == "__main__":
    main()
