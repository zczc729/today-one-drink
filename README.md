# 오늘 한잔

FastAPI, HTML/CSS/JavaScript, Gemini API로 구성된 익명 대화 서비스입니다. Upstash Redis가 채팅 요청 제한과 익명 운영 통계를 담당합니다. Redis 연결에 실패하면 Gemini 무료 한도를 보호하기 위해 채팅은 fail-closed로 차단됩니다. 방문 통계 실패는 일반 화면 이용을 막지 않습니다.

## 로컬 실행

```bash
python -m venv today
source today/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app:app --reload
```

`.env`에 Gemini, Upstash 비밀값과 서버에서만 사용할 긴 랜덤 `ANONYMIZATION_SECRET`을 등록하는 것을 권장합니다. 이 값이 없으면 서버 전용 Upstash 토큰을 HMAC 키로 사용하며, 어떤 경우에도 브라우저나 Redis에 키 원문을 저장하지 않습니다. 기존 `.env`는 덮어쓰지 않습니다.

## 관리자 설정

```bash
python scripts/generate_admin_password.py
```

스크립트가 숨김 입력으로 비밀번호를 두 번 받고 bcrypt 해시만 출력합니다. 출력을 `ADMIN_PASSWORD_HASH`에 등록하고, 별도의 긴 랜덤 값을 `ADMIN_SESSION_SECRET`에 등록합니다. 둘 중 하나라도 비어 있으면 관리자 로그인은 활성화되지 않습니다.

관리자 화면: `http://127.0.0.1:8000/admin`

## 테스트

```bash
pytest -q
node --test tests/beer-level.test.mjs tests/beer-expression.test.mjs
```

테스트는 실제 Gemini API를 호출하거나 운영 Redis를 삭제하지 않습니다. `FLUSHDB`를 사용하지 않습니다.

## Vercel 배포

Vercel Project Settings → Environment Variables에만 다음 값을 등록합니다.

- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANONYMIZATION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

한도 값을 변경할 때는 `.env.example`의 나머지 숫자 환경변수도 Vercel에 등록할 수 있습니다. 운영 환경에서는 Vercel의 `VERCEL_ENV=production`에 따라 관리자 쿠키의 `Secure` 속성이 자동으로 활성화됩니다. 실제 비밀값은 `vercel.json`, 소스 코드, 프런트엔드 파일에 넣지 않습니다.
