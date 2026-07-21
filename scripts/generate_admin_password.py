#!/usr/bin/env python3
import getpass

import bcrypt


def main() -> None:
    password = getpass.getpass("관리자 비밀번호: ")
    confirmation = getpass.getpass("비밀번호 확인: ")

    if not password:
        raise SystemExit("비밀번호는 빈 값일 수 없습니다.")
    if password != confirmation:
        raise SystemExit("비밀번호가 서로 다릅니다.")

    password_hash = bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")
    print(password_hash)


if __name__ == "__main__":
    main()
