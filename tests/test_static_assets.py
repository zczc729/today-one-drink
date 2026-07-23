from fastapi.testclient import TestClient

from app import app


def test_home_is_revalidated_on_each_visit():
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.headers["cache-control"] == (
        "no-cache, max-age=0, must-revalidate"
    )


def test_versioned_static_assets_are_cached_by_their_version():
    response = TestClient(app).get("/static/style.css?v=19")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    assert response.headers["cache-control"] == (
        "public, max-age=31536000, immutable"
    )
    assert response.headers["x-content-type-options"] == "nosniff"


def test_missing_static_asset_is_not_cached():
    response = TestClient(app).get("/static/missing.css?v=19")

    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"
