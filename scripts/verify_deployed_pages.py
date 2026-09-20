#!/usr/bin/env python3
"""Verify deployed Pages bytes, source identity, HTTPS, HSTS, and custom 404."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request


EXPECTED_FILES = {
    "404.html",
    "app.js",
    "data/world-110m.geojson",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
}


def request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": "NatureWxLab-plant-climate-mesh-verifier/1.0"})


def fetch(url: str, attempts: int = 4) -> tuple[bytes, object, str]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request(url), timeout=30) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                return response.read(), response.headers, response.geturl()
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(2)
    raise RuntimeError(f"failed to fetch {url}: {last_error}") from last_error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--manifest-attempts", type=int, default=24)
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/") + "/"
    parsed_base = urllib.parse.urlparse(base_url)
    if parsed_base.scheme != "https" or parsed_base.hostname != "nature-wx-lab.github.io":
        raise AssertionError("unexpected Pages origin")

    deployment = None
    manifest_url = urllib.parse.urljoin(base_url, "deployment.json")
    for attempt in range(args.manifest_attempts):
        raw, _, _ = fetch(manifest_url)
        candidate = json.loads(raw.decode("utf-8"))
        if candidate.get("source_commit") == args.source_commit:
            deployment = candidate
            break
        if attempt + 1 < args.manifest_attempts:
            time.sleep(10)
    if deployment is None:
        raise AssertionError("deployed source commit did not advance to the requested commit")
    if deployment.get("product") != "plant-climate-mesh":
        raise AssertionError("deployment product mismatch")
    if set(deployment.get("files", {})) != EXPECTED_FILES:
        raise AssertionError("deployment file allowlist mismatch")

    def verify(item: tuple[str, dict[str, int | str]]) -> tuple[str, int]:
        path, expected = item
        raw, headers, final_url = fetch(urllib.parse.urljoin(base_url, path))
        if urllib.parse.urlparse(final_url).hostname != "nature-wx-lab.github.io":
            raise AssertionError(f"unexpected asset redirect: {path}")
        if len(raw) != expected["bytes"]:
            raise AssertionError(f"deployed byte count mismatch: {path}")
        if hashlib.sha256(raw).hexdigest() != expected["sha256"]:
            raise AssertionError(f"deployed checksum mismatch: {path}")
        content_type = str(headers.get("Content-Type", "")).lower()
        if path.endswith(".html") and "text/html" not in content_type:
            raise AssertionError(f"HTML content type mismatch: {path}")
        if path.endswith(".css") and "text/css" not in content_type:
            raise AssertionError(f"CSS content type mismatch: {path}")
        if path.endswith(".js") and "javascript" not in content_type:
            raise AssertionError(f"JavaScript content type mismatch: {path}")
        if path.endswith(".geojson") and not any(kind in content_type for kind in ("json", "geo+json", "octet-stream")):
            raise AssertionError(f"GeoJSON content type mismatch: {path}")
        return path, len(raw)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        verified = list(executor.map(verify, deployment["files"].items()))

    index_raw, index_headers, final_url = fetch(base_url)
    if final_url.rstrip("/") != base_url.rstrip("/"):
        raise AssertionError("canonical Pages URL redirect mismatch")
    if b"Content-Security-Policy" not in index_raw:
        raise AssertionError("deployed CSP meta missing")
    hsts = str(index_headers.get("Strict-Transport-Security", ""))
    if "max-age=" not in hsts:
        raise AssertionError("GitHub Pages HSTS header missing")

    missing_url = urllib.parse.urljoin(base_url, "privacy-check-route-that-does-not-exist")
    try:
        fetch(missing_url, attempts=1)
        raise AssertionError("missing route unexpectedly returned HTTP 200")
    except RuntimeError as error:
        cause = error.__cause__
        if not isinstance(cause, urllib.error.HTTPError) or cause.code != 404:
            raise
        missing_body = cause.read()
    expected_404 = deployment["files"]["404.html"]
    if len(missing_body) != expected_404["bytes"] or hashlib.sha256(missing_body).hexdigest() != expected_404["sha256"]:
        raise AssertionError("custom 404 body mismatch")

    print(json.dumps({
        "status": "ok",
        "source_commit": deployment["source_commit"],
        "verified_file_count": len(verified),
        "verified_bytes": sum(size for _, size in verified),
        "https": True,
        "hsts": True,
        "custom_404": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
