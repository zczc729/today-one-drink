from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_mobile_background_uses_a_dedicated_cover_image():
    stylesheet = (ROOT / "static" / "style.css").read_text(
        encoding="utf-8"
    )

    assert "@media (max-width: 768px)" in stylesheet
    assert 'url("/static/assets/mobile_background.png?v=1")' in stylesheet
    assert "background-size: cover" in stylesheet
    assert "background-repeat: no-repeat" in stylesheet
    assert "background-position: center center" in stylesheet


def test_mobile_layout_uses_independent_glass_and_bottle_variables():
    stylesheet = (ROOT / "static" / "style.css").read_text(
        encoding="utf-8"
    )
    app_script = (ROOT / "static" / "app.js").read_text(
        encoding="utf-8"
    )

    for variable in [
        "--glass-size",
        "--glass-bottom",
        "--refill-enter-x",
        "--refill-enter-y",
    ]:
        assert variable in stylesheet

    assert '"(max-width: 768px), "' in app_script
    assert "? 1.10" in app_script
