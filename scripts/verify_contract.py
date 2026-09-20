#!/usr/bin/env python3
"""Verify the source and browser-facing contract for Plant Climate Mesh."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
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
    "data/world-50m.geojson",
    "index.html",
    "robots.txt",
    "scripts/build_deployment_manifest.py",
    "scripts/privacy_gate.py",
    "scripts/verify_contract.py",
    "scripts/verify_deployed_pages.py",
    "sitemap.xml",
    "styles.css",
}
DEPLOY_FILES = {
    "404.html",
    "app.js",
    "data/world-50m.geojson",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
}


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
    require("<script src=\"./app.js?v=20260920-daily1\" defer></script>" in index, "versioned local deferred script missing")
    require('href="./styles.css?v=20260920-daily1"' in index, "versioned local stylesheet missing")
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
    require("0.5°×0.625°" in index and "日射は1°×1°" in index, "native resolution disclosure missing")
    require("円内・枠内の面積平均ではありません" in index, "selection-area disclosure missing")
    require("通常日は30年分、2月29日は8年分" in index, "daily aggregation sample disclosure missing")
    require("使い方" not in index, "guide link must stay absent until its note exists")
    for url in (
        "https://naturewxlab.com/",
        "https://www.youtube.com/@nature_wx_lab",
        "https://note.com/nature_wx_lab",
        "https://x.com/nature_wx_lab",
    ):
        require(f'href="{url}"' in index, f"header link missing: {url}")
    require('id="resultPanel"' in index and 'aria-controls="resultPanel"' in index, "collapsible data drawer missing")
    require('id="resultPanel" class="result-panel" aria-labelledby="resultHeading" hidden' in index, "drawer must be hidden initially")
    for chart_id in ("temperatureChart", "precipitationChart", "solarChart", "humidityChart"):
        require(f'id="{chart_id}"' in index, f"chart missing: {chart_id}")
    require("月別の数値表" in index, "monthly table disclosure missing")

    require("https://power.larc.nasa.gov/api/temporal/climatology/point" in app, "POWER endpoint mismatch")
    require("https://power.larc.nasa.gov/api/temporal/daily/point" in app, "POWER daily endpoint mismatch")
    for parameter in ("T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"):
        require(parameter in app, f"missing POWER parameter {parameter}")
    for parameter in ("T2M_MAX", "T2M_MIN"):
        require(parameter in app, f"missing POWER daily parameter {parameter}")
    require('start: "1991"' in app and 'end: "2020"' in app, "climatology window mismatch")
    require('start: "19910101"' in app and 'end: "20201231"' in app, "daily window mismatch")
    require('"time-standard": "LST"' in app, "daily time standard mismatch")
    require('credentials: "omit"' in app, "cross-origin credentials must be omitted")
    require('referrerPolicy: "no-referrer"' in app, "POWER request referrer policy missing")
    require("AbortController" in app and "requestSerial" in app, "stale-response protection missing")
    require("innerHTML" not in app and "outerHTML" not in app, "unsafe HTML insertion detected")
    require("Math.atan(Math.sinh(mercator))" in app, "inverse Web Mercator formula missing")
    require("Math.log((1 + sine) / (1 - sine))" in app, "forward Web Mercator formula missing")
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
    require("./data/world-50m.geojson" in app, "Natural Earth 1:50m map path missing")

    require("overflow-x: auto" in styles, "narrow-screen table overflow guard missing")
    require("@media (max-width: 760px)" in styles, "mobile layout missing")
    require("touch-action: none" in styles, "map pan contract missing")
    require("height: calc(100svh - 43px)" in styles, "desktop map-first viewport contract missing")

    collection = json.loads((ROOT / "data/world-50m.geojson").read_text(encoding="utf-8"))
    require(collection.get("type") == "FeatureCollection", "world map is not a FeatureCollection")
    features = collection.get("features")
    require(isinstance(features, list) and 230 <= len(features) <= 270, "unexpected Natural Earth feature count")
    coordinate_count = 0
    for feature in features:
        require(set(feature) == {"type", "properties", "geometry"}, "unexpected GeoJSON feature keys")
        require(set(feature.get("properties", {})) <= {"name"}, "world map exposes unnecessary properties")
        geometry = feature.get("geometry", {})
        require(geometry.get("type") in {"Polygon", "MultiPolygon"}, "unsupported world geometry")
        for coordinate in all_coordinates(geometry.get("coordinates")):
            coordinate_count += 1
            longitude, latitude = coordinate[:2]
            require(-180.000001 <= longitude <= 180.000001 and -90 <= latitude <= 90, "world coordinate out of range")
    require(coordinate_count > 50_000, "world map geometry is unexpectedly sparse")

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
