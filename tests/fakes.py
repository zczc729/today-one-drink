import threading
import time


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.expiries = {}
        self.zsets = {}
        self.lock = threading.RLock()

    def _purge(self, key):
        expiry = self.expiries.get(key)
        if expiry is not None and expiry <= time.time():
            self.values.pop(key, None)
            self.zsets.pop(key, None)
            self.expiries.pop(key, None)

    def set(self, key, value, nx=None, xx=None, ex=None, **kwargs):
        with self.lock:
            self._purge(key)
            exists = key in self.values or key in self.zsets
            if nx and exists:
                return None
            if xx and not exists:
                return None
            self.values[key] = str(value)
            if ex:
                self.expiries[key] = time.time() + int(ex)
            return True

    def get(self, key):
        with self.lock:
            self._purge(key)
            return self.values.get(key)

    def delete(self, *keys):
        deleted = 0
        with self.lock:
            for key in keys:
                self._purge(key)
                if key in self.values or key in self.zsets:
                    deleted += 1
                self.values.pop(key, None)
                self.zsets.pop(key, None)
                self.expiries.pop(key, None)
        return deleted

    def expire(self, key, seconds):
        with self.lock:
            if key in self.values or key in self.zsets:
                self.expiries[key] = time.time() + int(seconds)
                return 1
        return 0

    def ttl(self, key):
        with self.lock:
            self._purge(key)
            if key not in self.values and key not in self.zsets:
                return -2
            if key not in self.expiries:
                return -1
            return max(0, int(self.expiries[key] - time.time()))

    def incr(self, key):
        return self.incrby(key, 1)

    def incrby(self, key, amount):
        with self.lock:
            self._purge(key)
            value = int(self.values.get(key, 0)) + int(amount)
            self.values[key] = str(value)
            return value

    def mget(self, *keys):
        return [self.get(key) for key in keys]

    @staticmethod
    def _score(value, default):
        if value == "-inf":
            return float("-inf")
        if value == "+inf":
            return float("inf")
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def zadd(self, key, scores, **kwargs):
        with self.lock:
            self._purge(key)
            target = self.zsets.setdefault(key, {})
            added = 0
            for member, score in scores.items():
                if member not in target:
                    added += 1
                target[str(member)] = float(score)
            return added

    def zremrangebyscore(self, key, minimum, maximum):
        with self.lock:
            self._purge(key)
            target = self.zsets.setdefault(key, {})
            low = self._score(minimum, float("-inf"))
            high = self._score(maximum, float("inf"))
            removed = [
                member for member, score in target.items()
                if low <= score <= high
            ]
            for member in removed:
                del target[member]
            return len(removed)

    def zcard(self, key):
        with self.lock:
            self._purge(key)
            return len(self.zsets.get(key, {}))

    def zcount(self, key, minimum, maximum):
        with self.lock:
            self._purge(key)
            low = self._score(minimum, float("-inf"))
            high = self._score(maximum, float("inf"))
            return sum(
                low <= score <= high
                for score in self.zsets.get(key, {}).values()
            )

    def eval(self, script, keys=None, args=None):
        keys = keys or []
        args = args or []
        with self.lock:
            if "tod_compare_delete_v1" in script:
                if self.get(keys[0]) == args[0]:
                    return self.delete(keys[0])
                return 0
            if "tod_compare_expire_v1" in script:
                if self.get(keys[0]) == args[0]:
                    return self.expire(keys[0], int(args[1]))
                return 0
            if "tod_chat_reserve_v1" in script:
                return self._reserve_initial(keys, args)
            if "tod_retry_reserve_v1" in script:
                return self._reserve_retry(keys, args)
            if "tod_analytics_visit_v1" in script:
                is_new = self.set(keys[0], "1", nx=True, ex=int(args[0]))
                if is_new:
                    self.incr(keys[1])
                self.expire(keys[1], int(args[0]))
                self.zadd(keys[2], {args[2]: float(args[1])})
                self.expire(keys[2], int(args[0]))
                return 1 if is_new else 0
            if "tod_analytics_chat_v1" in script:
                is_new = self.set(keys[0], "1", nx=True, ex=int(args[0]))
                if is_new:
                    self.incr(keys[1])
                self.expire(keys[1], int(args[0]))
                self.incr(keys[2])
                self.expire(keys[2], int(args[0]))
                self.zadd(keys[3], {args[2]: float(args[1])})
                self.expire(keys[3], int(args[0]))
                return 1 if is_new else 0
            raise AssertionError("Unknown Lua script")

    def _retry_after(self, key, now_ms, window_ms):
        earliest = min(self.zsets.get(key, {}).values())
        return max(1, int((earliest + window_ms - now_ms + 999) // 1000))

    def _reserve_initial(self, keys, args):
        now_ms, member, window_ms = int(args[0]), args[1], int(args[2])
        user_limit, global_limit = int(args[3]), int(args[4])
        daily_limit, session_limit = int(args[5]), int(args[6])
        window_ttl, daily_ttl, session_ttl = map(int, args[7:10])
        self.zremrangebyscore(keys[0], "-inf", now_ms - window_ms)
        self.zremrangebyscore(keys[1], "-inf", now_ms - window_ms)
        session_count = int(self.get(keys[3]) or 0)
        if session_count >= session_limit:
            return [1, 0, session_count]
        user_count = self.zcard(keys[0])
        if user_count >= user_limit:
            return [2, self._retry_after(keys[0], now_ms, window_ms), user_count]
        global_count = self.zcard(keys[1])
        if global_count >= global_limit:
            return [3, self._retry_after(keys[1], now_ms, window_ms), global_count]
        daily_count = int(self.get(keys[2]) or 0)
        if daily_count >= daily_limit:
            return [4, 0, daily_count]
        self.zadd(keys[0], {member: now_ms})
        self.expire(keys[0], window_ttl)
        self.zadd(keys[1], {member: now_ms})
        self.expire(keys[1], window_ttl)
        self.incr(keys[2])
        self.expire(keys[2], daily_ttl)
        self.incr(keys[3])
        self.expire(keys[3], session_ttl)
        return [0, 0, daily_count + 1]

    def _reserve_retry(self, keys, args):
        now_ms, member, window_ms = int(args[0]), args[1], int(args[2])
        global_limit, daily_limit = int(args[3]), int(args[4])
        window_ttl, daily_ttl = int(args[5]), int(args[6])
        self.zremrangebyscore(keys[0], "-inf", now_ms - window_ms)
        global_count = self.zcard(keys[0])
        if global_count >= global_limit:
            return [3, self._retry_after(keys[0], now_ms, window_ms), global_count]
        daily_count = int(self.get(keys[1]) or 0)
        if daily_count >= daily_limit:
            return [4, 0, daily_count]
        self.zadd(keys[0], {member: now_ms})
        self.expire(keys[0], window_ttl)
        self.incr(keys[1])
        self.expire(keys[1], daily_ttl)
        return [0, 0, daily_count + 1]
