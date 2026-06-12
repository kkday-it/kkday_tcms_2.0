"""
Uploads API — Unit Tests

Guards the regression fixed in the uploads/static hotfix: with root_path="/tcms"
the old `app.mount(StaticFiles)` stopped matching and every uploaded file 404'd.
These tests pin the upload → serve round-trip through a normal route, plus the
path-traversal guards.
"""

import os

import pytest
from httpx import AsyncClient

from app.api.uploads import UPLOAD_DIR


def _cleanup(url: str):
    """Remove the file created under uploads/ for a returned static URL."""
    name = url.rsplit("/", 1)[-1]
    path = os.path.join(UPLOAD_DIR, name)
    if os.path.isfile(path):
        os.remove(path)


@pytest.mark.asyncio
async def test_upload_then_serve_roundtrip(client: AsyncClient):
    """An uploaded .xmind must be retrievable at the URL the upload returns."""
    payload = b"PK\x03\x04 fake-xmind-bytes"
    resp = await client.post(
        "/api/v1/uploads/",
        files={"file": ("mindmap.xmind", payload, "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    url = resp.json()["url"]
    assert url.startswith("/api/v1/uploads/static/")

    try:
        got = await client.get(url)
        assert got.status_code == 200, got.text
        assert got.content == payload
        # unknown extension must not be mislabeled as text/plain
        assert got.headers["content-type"] == "application/octet-stream"
        assert "max-age" in got.headers.get("cache-control", "")
    finally:
        _cleanup(url)


@pytest.mark.asyncio
async def test_serve_missing_file_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/uploads/static/does-not-exist.xmind")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_serve_rejects_path_traversal(client: AsyncClient):
    # Encoded traversal must never escape the uploads dir.
    resp = await client.get("/api/v1/uploads/static/..%2f..%2fmain.py")
    assert resp.status_code in (400, 404)
    assert b"root_path" not in resp.content  # never leak main.py
