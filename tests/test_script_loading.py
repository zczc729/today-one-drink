from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_beer_level_math_script_loads_before_app_with_same_version():
    index_html = (ROOT / "templates" / "index.html").read_text(
        encoding="utf-8"
    )
    beer_script = (
        '<script src="/static/beer-level.js?v=17" defer></script>'
    )
    app_script = '<script src="/static/app.js?v=17" defer></script>'

    assert beer_script in index_html
    assert app_script in index_html
    assert index_html.index(beer_script) < index_html.index(app_script)


def test_app_validates_every_beer_level_math_dependency():
    app_script = (ROOT / "static" / "app.js").read_text(
        encoding="utf-8"
    )

    for member in [
        "TOTAL_DRINK_MS",
        "clampConsumedMs",
        "getVisualLevel",
        "getLogicalLevel",
        "getConsumedMsForLevel",
        "getConsumedMsAt",
        "BEER_MOTION_DURATIONS",
        "getHeldMotionState",
        "shouldShowDrinkingOverlay",
        "FULL_POUR_DURATION",
        "getAutoPourLevel",
        "canStartAutoPour",
        "getPourStreamGeometry",
        "getRefillBottleLayout",
    ]:
        assert member in app_script

    assert "BeerLevelMath를 찾을 수 없습니다" in app_script
