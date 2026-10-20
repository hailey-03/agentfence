"""가입·로그인 (PRD F1)."""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app import config
from app.main import app

c = TestClient(app)


PW = "Password1!"


def signup(email, pw=PW, nickname="테스터"):
    return c.post("/api/auth/signup", json={"email": email, "password": pw, "nickname": nickname})


def login(email, pw=PW):
    return c.post("/api/auth/login", data={"username": email, "password": pw})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_signup_login_me():
    r = signup("Alice@Test.dev", nickname="앨리스")
    assert r.status_code == 201
    assert r.json()["email"] == "alice@test.dev" and r.json()["nickname"] == "앨리스"
    assert "password" not in r.text and "password_hash" not in r.json()
    r = login("ALICE@test.dev")                                           # 대소문자 무시
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"
    me = c.get("/api/users/me", headers=bearer(r.json()["access_token"]))
    assert me.status_code == 200 and me.json()["email"] == "alice@test.dev"


def test_duplicate_email_conflict():
    assert signup("dup@test.dev").status_code == 201
    assert signup("DUP@test.dev").status_code == 409


def test_rejects_bad_input():
    assert signup("short@test.dev", "1234567").status_code == 422
    assert signup("not-an-email").status_code == 422
    assert signup("nonick@test.dev", nickname="   ").status_code == 422
    assert signup("longnick@test.dev", nickname="가" * 51).status_code == 422


def test_password_over_72_bytes_rejected_not_500():
    # 한글은 글자당 3바이트. 글자 수로는 짧아도 bcrypt 한도(72바이트)를 넘을 수 있다
    ok = "Aa1!" + "가" * 22                                             # 4 + 66 = 70바이트
    too_long = "Aa1!" + "가" * 23                                       # 4 + 69 = 73바이트 (글자 수는 27)
    assert signup("kor@test.dev", too_long).status_code == 422
    assert signup("kor24@test.dev", ok).status_code == 201
    assert login("kor24@test.dev", ok).status_code == 200
    assert login("kor24@test.dev", too_long).status_code == 401


def test_wrong_password_and_unknown_user_same_message():
    signup("bob@test.dev")
    a = login("bob@test.dev", "wrongpass1")
    b = login("nobody@test.dev", "wrongpass1")
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]                       # 가입 여부를 알려주지 않음


def test_password_is_hashed_not_stored():
    from app.db import SessionLocal
    from app.models import User
    signup("hash@test.dev", "Plaintext-pw1")
    with SessionLocal() as db:
        u = db.query(User).filter_by(email="hash@test.dev").one()
        assert "Plaintext-pw1" not in u.password_hash and u.password_hash.startswith("$2b$")


def test_bad_missing_and_expired_tokens():
    assert c.get("/api/users/me").status_code == 401
    assert c.get("/api/users/me", headers=bearer("garbage")).status_code == 401
    forged = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "wrong-secret", algorithm="HS256")
    assert c.get("/api/users/me", headers=bearer(forged)).status_code == 401
    expired = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                         config.JWT_SECRET_KEY, algorithm="HS256")
    assert c.get("/api/users/me", headers=bearer(expired)).status_code == 401
    not_a_number = jwt.encode({"sub": "abc", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                              config.JWT_SECRET_KEY, algorithm="HS256")
    assert c.get("/api/users/me", headers=bearer(not_a_number)).status_code == 401   # 500 아님


def test_password_rules_on_signup():
    cases = {
        "@@@@@@@@": ["대문자", "소문자", "숫자"],      # 특수문자만
        "password1!": ["대문자"],
        "PASSWORD1!": ["소문자"],
        "Password!!": ["숫자"],
        "Password12": ["특수문자"],
        "Pass 1234": ["특수문자"],                    # 공백은 특수문자로 치지 않음
    }
    for i, (pw, missing) in enumerate(cases.items()):
        r = signup(f"rule{i}@test.dev", pw)
        assert r.status_code == 422, pw
        msg = str(r.json()["detail"])
        assert all(m in msg for m in missing), (pw, msg)
    assert signup("rule-ok@test.dev", "Abcdef1!").status_code == 201    # 딱 8자, 네 종류


def test_login_does_not_apply_password_rules():
    # 규칙이 생기기 전에 만든 약한 비밀번호 계정도 로그인은 되어야 한다
    from app.auth import hash_password
    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        db.add(User(email="legacy@test.dev", password_hash=hash_password("password123"), nickname="옛계정"))
        db.commit()
    assert login("legacy@test.dev", "password123").status_code == 200
