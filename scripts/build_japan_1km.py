#!/usr/bin/env python3
"""Export public, derived Japan-only 1 km climate tiles from current shared assets.

Run deliberately from the tool repository. The shared source is read-only. No
source manifest, station metadata, or private filesystem path is published.
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "japan-1km"
MONTH_DAYS = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
MISSING = -32768
COLORS = {
    "temperature": ((-50, "#21134f"), (-40, "#2c2b83"), (-30, "#3154b4"), (-20, "#377dcc"),
                    (-10, "#63add8"), (0, "#b8dfe4"), (10, "#eef1c2"), (20, "#ffd27a"),
                    (30, "#ed6c3b"), (40, "#b51f4b"), (50, "#59052c")),
    "precipitation_month": ((0, "#fff7ec"), (25, "#e0f3db"), (50, "#ccebc5"),
                            (100, "#a8ddb5"), (200, "#7bccc4"), (300, "#43a2ca"),
                            (500, "#0868ac"), (800, "#084081")),
    "precipitation_annual": ((0, "#fff7ec"), (250, "#e0f3db"), (500, "#ccebc5"),
                             (1000, "#a8ddb5"), (1500, "#7bccc4"), (2500, "#43a2ca"),
                             (4000, "#0868ac"), (6000, "#084081")),
    "solar": ((0, "#28306f"), (5, "#3769a9"), (10, "#4ca5c2"), (15, "#8bcf9c"),
              (20, "#eee879"), (25, "#f4a64f"), (30, "#cc4b3d"), (35, "#761d39")),
}


def current_snapshot(shared: Path, asset: str) -> Path:
    manifest = json.loads((shared / "asset-manifests" / f"{asset}.json").read_text())
    quality = manifest["quality"]
    if quality.get("phase") != "complete" or quality.get("usable_as_mesh") is not True:
        raise RuntimeError(f"{asset}: current asset is not usable")
    snapshot = (shared / quality["snapshot_path"]).resolve()
    if not snapshot.is_relative_to(shared.resolve()) or not snapshot.is_dir():
        raise RuntimeError(f"{asset}: invalid snapshot path")
    return snapshot


def mesh_bounds(codes: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Standard Japanese third-level mesh: south/west edges and one-cell steps."""
    codes = codes.astype(np.int64)
    first = codes // 1_000_000
    second = (codes // 10_000) % 100
    third = (codes // 1_000) % 10
    fourth = (codes // 100) % 10
    fifth = (codes // 10) % 10
    sixth = codes % 10
    south = first / 1.5 + third / 12 + fifth / 120
    west = second + 100 + fourth / 8 + sixth / 80
    return west, south, west + 1 / 80, south + 1 / 120


def colors_for(values: np.ndarray, stops: tuple[tuple[int, str], ...]) -> np.ndarray:
    positions = np.array([point for point, _ in stops], dtype=np.float32)
    channels = np.array([[int(color[i:i + 2], 16) for i in (1, 3, 5)] for _, color in stops], dtype=np.float32)
    rgb = np.column_stack([np.interp(values, positions, channels[:, i]) for i in range(3)])
    return np.rint(rgb).astype(np.uint8)


def project_x(longitude: np.ndarray) -> np.ndarray:
    return (longitude + 180) / 360 * 2048


def project_y(latitude: np.ndarray) -> np.ndarray:
    lat = np.clip(latitude, -85.05112878, 85.05112878)
    sine = np.sin(np.deg2rad(lat))
    return (0.5 - np.log((1 + sine) / (1 - sine)) / (4 * np.pi)) * 2048


def overview(codes: np.ndarray, map_values: dict[str, np.ndarray]) -> None:
    west, south, east, north = mesh_bounds(codes)
    left = np.floor(project_x(west)).astype(np.int32)
    right = np.ceil(project_x(east)).astype(np.int32)
    top = np.floor(project_y(north)).astype(np.int32)
    bottom = np.ceil(project_y(south)).astype(np.int32)
    mask = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    mask_draw = ImageDraw.Draw(mask)
    for i in range(len(codes)):
        mask_draw.rectangle((int(left[i]), int(top[i]), int(right[i]), int(bottom[i])),
                            fill=(248, 250, 248, 255))
    mask.save(OUT / "overview-mask.png", optimize=True)
    for variable, layer in (("tmean", "temperature"), ("precip", "precipitation"), ("solar", "solar")):
        for period in range(13):
            values = map_values[variable][period]
            factor = 1 if variable == "precip" else 0.1
            key = "precipitation_annual" if variable == "precip" and period == 12 else (
                "precipitation_month" if variable == "precip" else layer)
            palette = colors_for(values.astype(np.float32) * factor, COLORS[key])
            image = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            for i in np.flatnonzero(values != MISSING):
                # This is a global-view preview only. Zoomed views use the original cells.
                draw.rectangle((int(left[i]), int(top[i]), int(right[i]), int(bottom[i])),
                               fill=(*map(int, palette[i]), 255))
            suffix = "annual" if period == 12 else f"{period + 1:02d}"
            image.save(OUT / f"overview-{layer}-{suffix}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shared-root", type=Path, required=True)
    args = parser.parse_args()
    shared = args.shared_root.resolve()
    current = current_snapshot(shared, "daily-climate-normals-1km")
    tmin = current_snapshot(shared, "daily-tmin-normals-1km")
    codes = np.load(current / "grid.npz")["mesh_codes"]
    if not np.array_equal(codes, np.load(tmin / "grid.npz")["mesh_codes"]):
        raise RuntimeError("daily mesh grids do not match")
    if len(codes) != 387_717 or len(np.unique(codes)) != len(codes):
        raise RuntimeError("unexpected 1 km mesh inventory")
    prefixes = codes // 10_000
    groups = {}
    for prefix in np.unique(prefixes):
        indices = np.flatnonzero(prefixes == prefix)
        groups[int(prefix)] = indices[np.argsort(codes[indices])]
    OUT.mkdir(parents=True, exist_ok=True)
    maps = {prefix: {name: np.full((13, len(indices)), MISSING, dtype="<i2")
                     for name in ("tmean", "precip", "solar")}
            for prefix, indices in groups.items()}

    for variable in ("tmin", "tmean", "tmax", "precip", "solar"):
        root = tmin if variable == "tmin" else current
        key = "temperature_deci_c" if variable == "tmin" else "value_deci_unit"
        months = []
        for month, days in enumerate(MONTH_DAYS, 1):
            filename = f"month-{month:02d}.npz" if variable == "tmin" else f"{variable}-{month:02d}.npz"
            with np.load(root / filename) as source:
                block = source[key]
                if block.shape != (days, len(codes)):
                    raise RuntimeError(f"unexpected shape: {filename}")
                months.append(block)
        for prefix, indices in groups.items():
            matrix = np.concatenate([month[:, indices].T for month in months], axis=1).astype("<i2")
            if matrix.shape != (len(indices), 366):
                raise RuntimeError("daily matrix shape mismatch")
            with gzip.open(OUT / f"daily-{variable}-{prefix}.bin.gz", "wb", compresslevel=6) as stream:
                stream.write(matrix.tobytes(order="C"))
            if variable in ("tmean", "precip", "solar"):
                month_values = maps[prefix][variable]
                offset = 0
                for month_index, days in enumerate(MONTH_DAYS):
                    month = matrix[:, offset:offset + days]
                    # February 29 has 8 samples rather than 30; ordinary-day
                    # monthly anchors exclude it, as in the source asset QA.
                    if month_index == 1:
                        month = np.concatenate((month[:, :28], month[:, 29:]), axis=1)[:, :28]
                    good = month != MISSING
                    count = good.sum(axis=1)
                    total = np.where(good, month.astype(np.int32), 0).sum(axis=1)
                    if variable == "precip":
                        value = np.rint(total / 10).astype(np.int32)  # map: whole mm/month
                    else:
                        value = np.rint(total / np.maximum(count, 1)).astype(np.int32)
                    month_values[month_index] = np.where(count == month.shape[1], value, MISSING)
                    offset += days
                if variable == "precip":
                    annual = np.where(np.all(month_values[:12] != MISSING, axis=0),
                                      month_values[:12].astype(np.int32).sum(axis=0), MISSING)
                else:
                    weights = np.array((31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31), dtype=np.int32)
                    annual = np.where(np.all(month_values[:12] != MISSING, axis=0),
                                      np.rint(np.sum(month_values[:12].astype(np.int32) * weights[:, None], axis=0) / 365),
                                      MISSING)
                if np.any((annual != MISSING) & ((annual < -32767) | (annual > 32767))):
                    raise RuntimeError(f"annual map overflow: {variable}/{prefix}")
                month_values[12] = annual.astype("<i2")
            print(f"{variable} {prefix}", flush=True)
        del months

    all_maps = {name: np.full((13, len(codes)), MISSING, dtype="<i2")
                for name in ("tmean", "precip", "solar")}
    for prefix, indices in groups.items():
        with gzip.open(OUT / f"map-{prefix}.bin.gz", "wb", compresslevel=6) as stream:
            stream.write(codes[indices].astype("<u4").tobytes())
            for variable in ("tmean", "precip", "solar"):
                values = maps[prefix][variable]
                stream.write(values.tobytes(order="C"))
                all_maps[variable][:, indices] = values
    overview(codes, all_maps)
    catalog = {
        "schema": 1,
        "period": "1991-2020",
        "grid": "Japan standard third-level 1km mesh",
        "values": "estimated from JMA daily normals and existing monthly 1km meshes; not official JMA 1km daily normals",
        "cells": len(codes),
        "days": 366,
        "prefixes": {str(prefix): len(indices) for prefix, indices in groups.items()},
    }
    (OUT / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"exported {len(codes)} cells in {len(groups)} prefixes", flush=True)


if __name__ == "__main__":
    main()
