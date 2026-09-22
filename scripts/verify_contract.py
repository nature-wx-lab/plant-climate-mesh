#!/usr/bin/env python3
"""Verify the source and browser-facing contract for Plant Climate Mesh."""

from __future__ import annotations

import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIMATE_LAYER_KEYS = ("temperature", "precipitation", "humidity", "solar")
CLIMATE_LAYER_PERIODS = ("annual",) + tuple(f"{month:02d}" for month in range(1, 13))
CLIMATE_LAYER_FILES = {
    f"data/climate-layers/{key}-{period}.png"
    for key in CLIMATE_LAYER_KEYS
    for period in CLIMATE_LAYER_PERIODS
}
SOURCE_FILES = {
    ".githooks/pre-push",
    ".github/workflows/pages.yml",
    ".github/workflows/privacy-gate.yml",
    ".gitignore",
    ".nojekyll",
    "404.html",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "app.js",
    "data/koppen-geiger-1991-2020.png",
    "data/world-50m.geojson",
    "index.html",
    "robots.txt",
    "scripts/build_deployment_manifest.py",
    "scripts/build_climate_layers.py",
    "scripts/climate_layers_requirements.txt",
    "scripts/privacy_gate.py",
    "scripts/verify_contract.py",
    "scripts/verify_deployed_pages.py",
    "sitemap.xml",
    "styles.css",
    "data/climate-layers/manifest.json",
} | CLIMATE_LAYER_FILES
DEPLOY_FILES = {
    "404.html",
    "app.js",
    "data/koppen-geiger-1991-2020.png",
    "data/world-50m.geojson",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
    "data/climate-layers/manifest.json",
} | CLIMATE_LAYER_FILES


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def all_coordinates(value: object):
    if isinstance(value, list) and len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
        yield value
    elif isinstance(value, list):
        for child in value:
            yield from all_coordinates(child)


def main() -> None:
    actual_files = {
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file()
        and ".git" not in path.relative_to(ROOT).parts
        and "_site" not in path.relative_to(ROOT).parts
        and "__pycache__" not in path.relative_to(ROOT).parts
    }
    require(actual_files == SOURCE_FILES, f"source file allowlist mismatch: {sorted(actual_files ^ SOURCE_FILES)}")

    index = (ROOT / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    styles = (ROOT / "styles.css").read_text(encoding="utf-8")
    workflow = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")

    require("Content-Security-Policy" in index, "CSP meta is missing")
    require("connect-src 'self' https://power.larc.nasa.gov" in index, "POWER must be the only external connection")
    require("'unsafe-inline'" not in index and "'unsafe-eval'" not in index, "unsafe CSP directive")
    require("<script src=\"./app.js?v=20260922-floating1\" defer></script>" in index, "versioned local deferred script missing")
    require('href="./styles.css?v=20260922-floating1"' in index, "versioned local stylesheet missing")
    require(not re.search(r"<script[^>]+src=[\"']https?://", index), "external script detected")
    require(
        not re.search(r"<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']https?://", index),
        "external stylesheet detected",
    )
    require("referrer\" content=\"no-referrer" in index, "no-referrer policy missing")
    require("Cookie、アクセス解析、現在地取得" in index, "privacy disclosure missing")
    require("通常の通信情報" in index and "NASA POWERへ送信" in index, "external transmission disclosure missing")
    require("1991–2020年の気候平均" in index, "independent climate-average label missing")
    require("平年値" not in index, "official-normal terminology must not be used")
    require("Webメルカトル" in index, "projection disclosure missing")
    require("<title id=\"mapTitle\">" not in index, "hover map tooltip must stay absent")
    require('aria-label="世界地図"' in index, "accessible map label missing")
    require(index.count('href="#worldLayer"') == 3, "three wrapped world copies are required")
    require('x="-1000"' in index and 'x="1000"' in index, "east-west world copies missing")
    require("0.5°×0.625°" in index and "1°×1°格子" in index, "native resolution disclosure missing")
    require("気温・降水量・相対湿度は橙枠に対応する元格子の空間平均" in index, "meteorology-grid disclosure missing")
    require("日射量は同じ中心点に対応する別の1°×1°格子" in index, "solar-grid distinction missing")
    require("通常日は30年分、2月29日は8年分" in index, "daily aggregation sample disclosure missing")
    require("月降水量" in index and "mm/月" in index and "年降水量" in index, "precipitation total labels missing")
    require("日平均量に各月・年の日数を掛けて" in index, "precipitation conversion disclosure missing")
    require("使い方" not in index, "guide link must stay absent until its note exists")
    for url in (
        "https://naturewxlab.com/",
        "https://www.youtube.com/@nature_wx_lab",
        "https://note.com/nature_wx_lab",
        "https://x.com/nature_wx_lab",
    ):
        require(f'href="{url}"' in index, f"header link missing: {url}")
    require('id="resultPanel"' in index and 'aria-controls="resultPanel"' in index, "floating data panel missing")
    require('id="resultPanel" class="result-panel" aria-labelledby="resultHeading" hidden' in index, "floating panel must be hidden initially")
    require(index.count("data-result-resize") == 4, "four floating-panel resize handles are required")
    require('id="layerPanel" class="layer-panel"' in index, "left map-layer panel missing")
    require(index.count('data-weather-layer=') == 4, "four weather-layer controls are required")
    require('id="layerPeriod"' in index and index.count('<option value=') == 13, "annual and monthly period selector missing")
    require('id="weatherLayerToggle"' in index and 'id="weatherLayerOpacity"' in index, "weather-layer display controls missing")
    require('id="weatherLayer"' in index and 'id="weatherImage"' in index, "weather raster layer missing")
    require("NASA POWERの月別データから独自算出" in index, "map-layer provenance missing")
    for chart_id in ("temperatureChart", "precipitationChart", "solarChart", "humidityChart"):
        require(f'id="{chart_id}"' in index, f"chart missing: {chart_id}")
    require("月別の数値表" in index, "monthly table disclosure missing")
    require("平均日最高" in index and "平均日最低" in index, "monthly high-low columns missing")
    require('id="climateToggle"' in index and 'aria-pressed="false"' in index, "climate overlay toggle missing")
    require('data-src="./data/koppen-geiger-1991-2020.png"' in index, "climate overlay asset missing")
    require("ケッペン＝ガイガー気候区分" in index and "1991–2020年・0.1°版" in index, "climate overlay disclosure missing")
    require("国・地域：—｜首都：—" in index, "country and capital placeholder missing")
    require("1:50m Admin 0 Countries / 1:10m Populated Places" in index, "country/capital source disclosure missing")

    require("https://power.larc.nasa.gov/api/temporal/climatology/point" in app, "POWER endpoint mismatch")
    require("https://power.larc.nasa.gov/api/temporal/daily/point" in app, "POWER daily endpoint mismatch")
    for parameter in ("T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"):
        require(parameter in app, f"missing POWER parameter {parameter}")
    for parameter in ("T2M_MAX", "T2M_MIN"):
        require(parameter in app, f"missing POWER daily parameter {parameter}")
    require('const DAILY_PARAMETERS = ["T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN", "RH2M"]' in app, "daily solar or humidity parameter missing")
    require('start: "1991"' in app and 'end: "2020"' in app, "climatology window mismatch")
    require('start: "19910101"' in app and 'end: "20201231"' in app, "daily window mismatch")
    require('"time-standard": "LST"' in app, "daily time standard mismatch")
    require('credentials: "omit"' in app, "cross-origin credentials must be omitted")
    require('referrerPolicy: "no-referrer"' in app, "POWER request referrer policy missing")
    require("AbortController" in app and "requestSerial" in app, "stale-response protection missing")
    require("innerHTML" not in app and "outerHTML" not in app, "unsafe HTML insertion detected")
    require("Math.atan(Math.sinh(mercator))" in app, "inverse Web Mercator formula missing")
    require("Math.log((1 + sine) / (1 - sine))" in app, "forward Web Mercator formula missing")
    require("const METEOROLOGY_LAT_STEP = 0.5" in app, "meteorology latitude step missing")
    require("const METEOROLOGY_LON_STEP = 0.625" in app, "meteorology longitude step missing")
    require("gridLongitude - METEOROLOGY_LON_STEP / 2" in app, "meteorology grid boundary calculation missing")
    require("gridLatitude - METEOROLOGY_LAT_STEP / 2" in app, "meteorology grid boundary calculation missing")
    require("function wrapWorldX(value)" in app, "continuous longitude wrapper missing")
    require("state.centerX = wrapWorldX(centerX)" in app, "map center must wrap east-west")
    require("for (const offset of [-MAP_SIZE, 0, MAP_SIZE])" in app, "selection copies must wrap east-west")
    require("point.x < 0" not in app and "point.x > MAP_SIZE" not in app, "wrapped map clicks must accept repeated worlds")
    require('addEventListener("wheel", zoomFromWheel, { passive: false })' in app, "wheel zoom contract missing")
    require('addEventListener("pointerdown", beginDrag)' in app, "drag start contract missing")
    require('addEventListener("pointermove", moveDrag)' in app, "drag move contract missing")
    require("if (state.zoom < 8)" not in app, "point selection must not change zoom")
    require("r: 2.2 / state.zoom" in app and "selection-cross" not in app, "selection point must stay visually small")
    require("function averageByCalendarDay(payload, key)" in app, "daily calendar aggregation missing")
    require("function averageDailyValuesByMonth(payload, key)" in app, "monthly daily-extreme aggregation missing")
    require("function renderDailySolarChart(payload" in app, "daily solar chart missing")
    require("各暦日の平均全天日射量" in index, "daily solar chart label missing")
    require("function renderDailyHumidityChart(payload" in app, "daily humidity chart missing")
    require("各暦日の日平均相対湿度" in index, "daily humidity chart label missing")
    require("function monthlyPrecipitationTotals(payload)" in app, "monthly precipitation conversion missing")
    require("28 + 8 / 30" in app and "AVERAGE_DAYS_PER_YEAR" in app, "climatology day counts missing")
    require("cell.colSpan = 6" in app, "monthly table fallback span mismatch")
    require("tick += 5" in app and "tick === 0 || tick === 30" in app, "temperature axis interval or emphasis missing")
    require('viewBox="0 0 360 156"' in index, "temperature chart height mismatch")
    require("chart-gridline-emphasis" in styles and "chart-axis-label-emphasis" in styles, "temperature axis emphasis style missing")
    require("./data/world-50m.geojson" in app, "Natural Earth 1:50m map path missing")
    require("function geometryContainsPoint(" in app and "function countryAt(" in app, "country lookup missing")
    require("country.properties.capital" in app and "国・地域：海上｜首都：—" in app, "country/capital rendering missing")
    require("function toggleClimateLayer(" in app and "KOPPEN_CLASSES" in app, "climate overlay interaction missing")
    require("const WEATHER_LAYERS =" in app and "function updateWeatherLayer(" in app, "weather map-layer controller missing")
    require('`./data/climate-layers/${state.weatherLayer}-${state.weatherPeriod}.png`' in app, "weather layer asset path missing")
    require("weatherLayerOpacity" in app and "setWeatherVisibility" in app, "weather layer display interaction missing")
    require("function beginResultPanelDrag(" in app and "function moveResultPanelDrag(" in app, "floating-panel drag interaction missing")
    require("function beginResultPanelResize(" in app and "function moveResultPanelResize(" in app, "floating-panel resize interaction missing")
    require("resultPanelScale" in app and "0.65" in app and "1.45" in app, "floating-panel scale bounds missing")
    require(".climate-raster" in styles and ".climate-legend" in styles and ".country-border" in styles, "climate overlay style missing")
    require(".layer-panel" in styles and ".weather-layer-buttons" in styles and ".weather-legend" in styles, "left layer-panel styles missing")
    require(".weather-raster" in styles and "image-rendering: pixelated" in styles, "native-grid raster rendering missing")
    require("aspect-ratio: 16 / 9" in styles and ".panel-resize-handle" in styles, "16:9 floating-panel styles missing")

    require("overflow-x: auto" in styles, "narrow-screen table overflow guard missing")
    require("@media (max-width: 760px)" in styles, "mobile layout missing")
    require("touch-action: none" in styles, "map pan contract missing")
    require("height: calc(100svh - 43px)" in styles, "desktop map-first viewport contract missing")

    collection = json.loads((ROOT / "data/world-50m.geojson").read_text(encoding="utf-8"))
    require(collection.get("type") == "FeatureCollection", "world map is not a FeatureCollection")
    features = collection.get("features")
    require(isinstance(features, list) and 230 <= len(features) <= 270, "unexpected Natural Earth feature count")
    coordinate_count = 0
    capital_count = 0
    for feature in features:
        require(set(feature) == {"type", "properties", "geometry"}, "unexpected GeoJSON feature keys")
        properties = feature.get("properties", {})
        require(set(properties) <= {"name", "code", "capital"}, "world map exposes unnecessary properties")
        require(isinstance(properties.get("name"), str) and properties["name"], "country name missing")
        require(re.fullmatch(r"[A-Z0-9-]{3}", str(properties.get("code", ""))) is not None, "country code missing")
        if "capital" in properties:
            require(isinstance(properties["capital"], str) and properties["capital"], "invalid capital name")
            capital_count += 1
        geometry = feature.get("geometry", {})
        require(geometry.get("type") in {"Polygon", "MultiPolygon"}, "unsupported world geometry")
        for coordinate in all_coordinates(geometry.get("coordinates")):
            coordinate_count += 1
            longitude, latitude = coordinate[:2]
            require(-180.000001 <= longitude <= 180.000001 and -90 <= latitude <= 90, "world coordinate out of range")
    require(coordinate_count > 50_000, "world map geometry is unexpectedly sparse")
    require(capital_count >= 200, "capital coverage is unexpectedly sparse")

    overlay = (ROOT / "data/koppen-geiger-1991-2020.png").read_bytes()
    require(overlay.startswith(b"\x89PNG\r\n\x1a\n"), "climate overlay is not PNG")
    width, height = struct.unpack(">II", overlay[16:24])
    require((width, height) == (4096, 4096), "climate overlay dimensions mismatch")
    require(len(overlay) < 500_000, "climate overlay is unexpectedly large")

    climate_manifest = json.loads((ROOT / "data/climate-layers/manifest.json").read_text(encoding="utf-8"))
    require(climate_manifest.get("schema_version") == 1, "climate-layer manifest schema mismatch")
    require(climate_manifest.get("product") == "plant-climate-mesh", "climate-layer manifest product mismatch")
    require(climate_manifest.get("climatology_window") == {"start": 1991, "end": 2020}, "climate-layer period mismatch")
    require(climate_manifest.get("projection") == "EPSG:3857", "climate-layer projection mismatch")
    require(climate_manifest.get("image_size") == [2048, 2048], "climate-layer image size mismatch")
    require(set(climate_manifest.get("layers", {})) == set(CLIMATE_LAYER_KEYS), "climate-layer family mismatch")
    manifest_files = set()
    for key in CLIMATE_LAYER_KEYS:
        layer = climate_manifest["layers"][key]
        require(set(layer.get("periods", {})) == set(CLIMATE_LAYER_PERIODS), f"climate-layer periods mismatch: {key}")
        for period in CLIMATE_LAYER_PERIODS:
            record = layer["periods"][period]
            relative = f"data/climate-layers/{record['file']}"
            require(relative in CLIMATE_LAYER_FILES, f"unexpected climate-layer file: {relative}")
            raw = (ROOT / relative).read_bytes()
            require(raw.startswith(b"\x89PNG\r\n\x1a\n"), f"climate layer is not PNG: {relative}")
            width, height = struct.unpack(">II", raw[16:24])
            require((width, height) == (2048, 2048), f"climate-layer dimensions mismatch: {relative}")
            require(len(raw) == record["bytes"], f"climate-layer byte count mismatch: {relative}")
            require(hashlib.sha256(raw).hexdigest() == record["sha256"], f"climate-layer checksum mismatch: {relative}")
            require(len(raw) < 500_000, f"climate-layer file is unexpectedly large: {relative}")
            manifest_files.add(relative)
    require(manifest_files == CLIMATE_LAYER_FILES, "climate-layer manifest coverage mismatch")

    require("plant-climate-mesh/sitemap.xml" in robots, "robots sitemap mismatch")
    require("plant-climate-mesh/" in sitemap, "sitemap URL mismatch")
    require("deploy-pages@" in workflow and "privacy_gate.py" in workflow, "verified Pages workflow missing")
    require("permissions: {}" in workflow, "workflow must default to no permissions")

    hook = (ROOT / ".githooks/pre-push").read_text(encoding="utf-8")
    require("python3 scripts/privacy_gate.py" in hook, "pre-push privacy gate missing")
    require("git diff --check" in hook, "pre-push whitespace gate missing")

    subprocess.run(["node", "--check", str(ROOT / "app.js")], check=True)
    print(json.dumps({
        "status": "ok",
        "source_files": len(actual_files),
        "deploy_files": len(DEPLOY_FILES),
        "world_features": len(features),
        "world_coordinates": coordinate_count,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
