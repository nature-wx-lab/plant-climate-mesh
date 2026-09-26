#!/usr/bin/env python3
"""Union POWO-listed WGSRPD regions into display-only outer rings (Shapely 2)."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from shapely import make_valid, set_precision
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
TOLERANCE = 0.025  # degrees; drawing simplification, never a habitat boundary


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for child in geometry.geoms:
            yield from polygons(child)


def build(source_path: Path) -> None:
    catalog = json.loads((ROOT / 'data/plants.json').read_text())
    raw = source_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != catalog['regionSource']['sha256']:
        raise ValueError('WGSRPD source checksum differs from catalog')
    features = json.loads(raw)['features']
    regions = {f['properties']['LEVEL3_COD']: set_precision(make_valid(shape(f['geometry'])), 0.0001)
               for f in features}
    outlines = {}
    plant_keys = {}
    for plant in catalog['plants']:
        codes = plant['regionCodes']
        if not codes:
            continue
        key = '-'.join(codes)
        plant_keys[plant['id']] = key
        if key in outlines:
            continue
        merged = unary_union([regions[code] for code in codes])
        # Exterior rings only: connected regions share one outer line; islands stay separate.
        rings = []
        for polygon in polygons(merged):
            simple = polygon.simplify(TOLERANCE, preserve_topology=True)
            ring = [[round(x, 4), round(y, 4)] for x, y in simple.exterior.coords]
            if len(ring) >= 4:
                rings.append(ring)
        if not rings:
            raise ValueError(f"No outline for {plant['id']}")
        outlines[key] = {'rings': rings}
    result = {'schema': 1, 'sourceSha256': digest, 'simplificationDegrees': TOLERANCE,
              'plantKeys': plant_keys, 'outlines': outlines}
    output = ROOT / 'data/plant-outlines.json'
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'PLANT_OUTLINES_OK plants={len(plant_keys)} geometries={len(outlines)} bytes={output.stat().st_size}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wgsrpd_geojson', type=Path, help='Pinned TDWG level3.geojson; hash must match catalog')
    build(parser.parse_args().wgsrpd_geojson)
