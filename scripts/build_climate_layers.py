#!/usr/bin/env python3
"""Build 1991-2020 NASA POWER climate-map PNG layers from public AWS Zarr data."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import fsspec
import numpy as np
import xarray as xr
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_SIZE = 2048
START_YEAR = 1991
END_YEAR = 2020
AVERAGE_DAYS = np.asarray([31, 28 + 8 / 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], dtype=np.float64)
PERIODS = ("annual",) + tuple(f"{month:02d}" for month in range(1, 13))
MONTH_LABELS = ("年平均",) + tuple(f"{month}月" for month in range(1, 13))

MERRA_URL = (
    "https://nasa-power.s3.us-west-2.amazonaws.com/merra2/temporal/"
    "power_merra2_monthly_temporal_lst.zarr"
)
SRB_URL = (
    "https://nasa-power.s3.us-west-2.amazonaws.com/srb/temporal/"
    "power_srb_monthly_temporal_lst.zarr"
)
SYN1DEG_URL = (
    "https://nasa-power.s3.us-west-2.amazonaws.com/syn1deg/temporal/"
    "power_syn1deg_monthly_temporal_lst.zarr"
)

LAYERS = {
    "temperature": {
        "parameter": "T2M",
        "label": "平均気温",
        "unit": "℃",
        "source": "MERRA-2",
        "grid": "0.5°×0.625°",
        "stops": [
            [-50, "#21134f"], [-40, "#2c2b83"], [-30, "#3154b4"], [-20, "#377dcc"],
            [-10, "#63add8"], [0, "#b8dfe4"], [10, "#eef1c2"], [20, "#ffd27a"],
            [30, "#ed6c3b"], [40, "#b51f4b"], [50, "#59052c"],
        ],
    },
    "precipitation": {
        "parameter": "PRECTOTCORR",
        "label": "降水量",
        "unit": "mm",
        "source": "MERRA-2",
        "grid": "0.5°×0.625°",
        "monthly_stops": [
            [0, "#fff7ec"], [25, "#e0f3db"], [50, "#ccebc5"], [100, "#a8ddb5"],
            [200, "#7bccc4"], [300, "#43a2ca"], [500, "#0868ac"], [800, "#084081"],
        ],
        "annual_stops": [
            [0, "#fff7ec"], [250, "#e0f3db"], [500, "#ccebc5"], [1000, "#a8ddb5"],
            [1500, "#7bccc4"], [2500, "#43a2ca"], [4000, "#0868ac"], [6000, "#084081"],
        ],
    },
    "humidity": {
        "parameter": "RH2M",
        "label": "相対湿度",
        "unit": "%",
        "source": "MERRA-2",
        "grid": "0.5°×0.625°",
        "stops": [
            [0, "#7a4f28"], [20, "#bc8957"], [40, "#e3c89e"], [60, "#dce9c6"],
            [70, "#a9d8c3"], [80, "#58b5a7"], [90, "#257d89"], [100, "#174f70"],
        ],
    },
    "solar": {
        "parameter": "ALLSKY_SFC_SW_DWN",
        "label": "日射量",
        "unit": "MJ/㎡/日",
        "source": "SRB＋SYN1deg",
        "grid": "1°×1°",
        "stops": [
            [0, "#28306f"], [5, "#3769a9"], [10, "#4ca5c2"], [15, "#8bcf9c"],
            [20, "#eee879"], [25, "#f4a64f"], [30, "#cc4b3d"], [35, "#761d39"],
        ],
    },
}


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def color_at(value: float, stops: list[list[float | str]]) -> tuple[int, int, int]:
    if value <= float(stops[0][0]):
        return hex_rgb(str(stops[0][1]))
    if value >= float(stops[-1][0]):
        return hex_rgb(str(stops[-1][1]))
    for (left_value, left_color), (right_value, right_color) in zip(stops, stops[1:]):
        left_value = float(left_value)
        right_value = float(right_value)
        if left_value <= value <= right_value:
            fraction = (value - left_value) / (right_value - left_value)
            left_rgb = hex_rgb(str(left_color))
            right_rgb = hex_rgb(str(right_color))
            return tuple(round(left + (right - left) * fraction) for left, right in zip(left_rgb, right_rgb))
    raise AssertionError("color stop interpolation failed")


def palette_for(stops: list[list[float | str]]) -> list[int]:
    minimum = float(stops[0][0])
    maximum = float(stops[-1][0])
    palette = [0, 0, 0]
    for index in range(1, 256):
        value = minimum + ((index - 1) / 254) * (maximum - minimum)
        palette.extend(color_at(value, stops))
    return palette


def nearest_indices(coordinates: np.ndarray, targets: np.ndarray) -> np.ndarray:
    step = float(coordinates[1] - coordinates[0])
    indices = np.rint((targets - float(coordinates[0])) / step).astype(np.int32)
    return np.clip(indices, 0, len(coordinates) - 1)


def web_mercator_indices(latitudes: np.ndarray, longitudes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    x = np.arange(OUTPUT_SIZE, dtype=np.float64) + 0.5
    y = np.arange(OUTPUT_SIZE, dtype=np.float64) + 0.5
    target_longitudes = (x / OUTPUT_SIZE) * 360 - 180
    mercator = math.pi * (1 - 2 * y / OUTPUT_SIZE)
    target_latitudes = np.degrees(np.arctan(np.sinh(mercator)))
    return nearest_indices(latitudes, target_latitudes), nearest_indices(longitudes, target_longitudes)


def save_layer(values: np.ndarray, latitudes: np.ndarray, longitudes: np.ndarray, stops: list[list[float | str]], path: Path) -> dict[str, int | float | str]:
    lat_indices, lon_indices = web_mercator_indices(latitudes, longitudes)
    projected = values[lat_indices[:, None], lon_indices[None, :]]
    finite = np.isfinite(projected)
    minimum = float(stops[0][0])
    maximum = float(stops[-1][0])
    normalized = np.clip((projected - minimum) / (maximum - minimum), 0, 1)
    indexed = np.where(finite, np.rint(normalized * 254).astype(np.uint8) + 1, 0)
    image = Image.fromarray(indexed, mode="P")
    image.putpalette(palette_for(stops))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9, transparency=0)
    raw = path.read_bytes()
    source_finite = values[np.isfinite(values)]
    return {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "source_min": round(float(source_finite.min()), 4),
        "source_max": round(float(source_finite.max()), 4),
        "source_valid_cells": int(source_finite.size),
    }


def open_zarr(url: str) -> xr.Dataset:
    return xr.open_zarr(fsspec.get_mapper(url), consolidated=True, zarr_format=2)


def monthly_climatology(data: xr.DataArray, start: str, end: str) -> xr.DataArray:
    return data.sel(time=slice(start, end)).groupby("time.month").mean("time", skipna=True).compute()


def annual_mean(monthly: np.ndarray) -> np.ndarray:
    weights = AVERAGE_DAYS[:, None, None]
    valid = np.isfinite(monthly)
    numerator = np.nansum(monthly * weights, axis=0)
    denominator = np.sum(np.where(valid, weights, 0), axis=0)
    return np.divide(numerator, denominator, out=np.full_like(numerator, np.nan), where=denominator > 0)


def meteorology_layers() -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    dataset = open_zarr(MERRA_URL)
    output: dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
    try:
        for key in ("temperature", "precipitation", "humidity"):
            parameter = str(LAYERS[key]["parameter"])
            monthly = monthly_climatology(dataset[parameter], "1991-01-01", "2020-12-31")
            values = np.asarray(monthly.values, dtype=np.float32)
            if key == "precipitation":
                monthly_values = values * AVERAGE_DAYS[:, None, None]
                annual_values = np.nansum(monthly_values, axis=0)
            else:
                monthly_values = values
                annual_values = annual_mean(values)
            output[key] = (
                np.concatenate([annual_values[None, ...], monthly_values], axis=0),
                np.asarray(monthly.lat.values),
                np.asarray(monthly.lon.values),
            )
    finally:
        dataset.close()
    return output


def solar_layers() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    srb = open_zarr(SRB_URL)
    syn = open_zarr(SYN1DEG_URL)
    try:
        parameter = "ALLSKY_SFC_SW_DWN"
        combined = xr.concat(
            [
                srb[parameter].sel(time=slice("1991-01-01", "2000-12-31")),
                syn[parameter].sel(time=slice("2001-01-01", "2020-12-31")),
            ],
            dim="time",
        )
        monthly = combined.groupby("time.month").mean("time", skipna=True).compute() * 0.0864
        values = np.asarray(monthly.values, dtype=np.float32)
        annual_values = annual_mean(values)
        return (
            np.concatenate([annual_values[None, ...], values], axis=0),
            np.asarray(monthly.lat.values),
            np.asarray(monthly.lon.values),
        )
    finally:
        srb.close()
        syn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "climate-layers")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    fields = meteorology_layers()
    fields["solar"] = solar_layers()
    manifest: dict[str, object] = {
        "schema_version": 1,
        "product": "plant-climate-mesh",
        "climatology_window": {"start": START_YEAR, "end": END_YEAR},
        "time_standard": "LST",
        "projection": "EPSG:3857",
        "image_size": [OUTPUT_SIZE, OUTPUT_SIZE],
        "sources": {
            "meteorology": MERRA_URL,
            "solar_1991_2000": SRB_URL,
            "solar_2001_2020": SYN1DEG_URL,
        },
        "layers": {},
    }

    for key, (values, latitudes, longitudes) in fields.items():
        config = LAYERS[key]
        layer_manifest: dict[str, object] = {
            "label": config["label"],
            "unit": config["unit"],
            "source": config["source"],
            "source_grid": config["grid"],
            "periods": {},
        }
        for index, (period, label) in enumerate(zip(PERIODS, MONTH_LABELS)):
            stops = config.get("annual_stops") if period == "annual" else config.get("monthly_stops")
            if stops is None:
                stops = config["stops"]
            filename = f"{key}-{period}.png"
            stats = save_layer(values[index], latitudes, longitudes, stops, output / filename)
            layer_manifest["periods"][period] = {"label": label, "file": filename, **stats}
            print(f"built {filename} ({stats['bytes']} bytes)", flush=True)
        manifest["layers"][key] = layer_manifest

    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"status": "ok", "layers": len(fields), "assets": len(fields) * len(PERIODS)}))


if __name__ == "__main__":
    main()
