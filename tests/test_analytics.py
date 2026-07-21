from datetime import datetime, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from services.analytics_service import AnalyticsService


def test_same_session_visit_is_counted_once(settings, fake_redis):
    analytics = AnalyticsService(settings, fake_redis)
    session_id = str(uuid4())
    assert analytics.record_visit(session_id) is True
    assert analytics.record_visit(session_id) is False
    key = analytics._analytics_key("visitors", analytics._date_key())
    assert int(fake_redis.get(key)) == 1


def test_chat_user_is_unique_but_messages_increment(settings, fake_redis):
    analytics = AnalyticsService(settings, fake_redis)
    session_id = str(uuid4())
    analytics.record_chat_accepted(session_id)
    analytics.record_chat_accepted(session_id)
    date_key = analytics._date_key()
    assert int(fake_redis.get(analytics._analytics_key("chat-users", date_key))) == 1
    assert int(fake_redis.get(analytics._analytics_key("chat-messages", date_key))) == 2


def test_success_and_response_time_are_recorded(settings, fake_redis):
    analytics = AnalyticsService(settings, fake_redis)
    analytics.record_success(1200)
    analytics.record_success(800)
    dashboard = analytics.dashboard()
    assert dashboard["today"]["successful_chats"] == 2
    assert dashboard["performance"]["average_response_ms"] == 1000
    assert dashboard["performance"]["latest_response_ms"] == 800


def test_dashboard_fills_all_seven_days_with_zeros(settings, fake_redis):
    dashboard = AnalyticsService(settings, fake_redis).dashboard()
    assert len(dashboard["last_7_days"]) == 7
    assert all(day["visitors"] == 0 for day in dashboard["last_7_days"])
    assert dashboard["today"]["average_messages_per_chat_user"] == 0
    assert dashboard["today"]["visitor_to_chat_conversion_percent"] == 0


def test_dashboard_calculates_average_conversion_and_remaining(settings, fake_redis):
    analytics = AnalyticsService(settings, fake_redis)
    date_key = analytics._date_key()
    fake_redis.set(analytics._analytics_key("visitors", date_key), 10)
    fake_redis.set(analytics._analytics_key("chat-users", date_key), 4)
    fake_redis.set(analytics._analytics_key("chat-messages", date_key), 14)
    dashboard = analytics.dashboard()
    assert dashboard["today"]["average_messages_per_chat_user"] == 3.5
    assert dashboard["today"]["visitor_to_chat_conversion_percent"] == 40
    assert dashboard["gemini_usage"]["app_daily_remaining"] == 400


def test_analytics_keys_receive_retention_ttl(settings, fake_redis):
    analytics = AnalyticsService(settings, fake_redis)
    analytics.record_visit(str(uuid4()))
    analytics.record_chat_accepted(str(uuid4()))
    analytics.record_success(50)
    analytics_keys = [
        key for key in set(fake_redis.values) | set(fake_redis.zsets)
        if ":analytics:" in key
    ]
    assert analytics_keys
    assert all(fake_redis.ttl(key) > 0 for key in analytics_keys)


def test_kst_and_pacific_dates_can_differ():
    instant = datetime(2026, 7, 21, 7, 30, tzinfo=timezone.utc)
    kst_date = instant.astimezone(ZoneInfo("Asia/Seoul")).date()
    pacific_date = instant.astimezone(
        ZoneInfo("America/Los_Angeles")
    ).date()
    assert kst_date.isoformat() == "2026-07-21"
    assert pacific_date.isoformat() == "2026-07-21"


def test_timezone_boundary_is_explicit():
    instant = datetime(2026, 7, 21, 2, 0, tzinfo=timezone.utc)
    assert instant.astimezone(ZoneInfo("Asia/Seoul")).date().isoformat() == "2026-07-21"
    assert instant.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat() == "2026-07-20"
