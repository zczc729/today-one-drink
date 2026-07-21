from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


KST = ZoneInfo("Asia/Seoul")
PACIFIC = ZoneInfo("America/Los_Angeles")


def now_kst() -> datetime:
    return datetime.now(KST)


def now_pacific() -> datetime:
    return datetime.now(PACIFIC)


def seconds_until_after_midnight(
    current: datetime,
    extra_days: int = 1,
) -> int:
    next_date = current.date() + timedelta(days=extra_days)
    boundary = datetime.combine(
        next_date,
        time.min,
        tzinfo=current.tzinfo,
    )
    return max(60, int((boundary - current).total_seconds()))
