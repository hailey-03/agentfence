"""가입·로그인 (PRD F1)."""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient

from app import config
from app.main import app

c = TestClient(app)


def signup(email, pw="password123"):
    return c.post("/api/auth/signup", json={"email": email, "password": pw})


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_signup_login_me():
    r = signup("Alice@Test.dev")
    assert r.status_code == 200
    r = c.post("/api/auth/login", json={"email": "alice@test.dev", "password": "password123"})  # 대소문자 무시
    assert r.status_code == 200
    me = c.get("/api/auth/me", headers=bearer(r.json()["token"]))
    assert me.status_code == 200 and me.json()["email"] == "alice@test.dev"


def test_duplicate_email_conflict():
    signup("dup@test.dev")
    assert signup("DUP@test.dev").status_code == 409


def test_rejects_short_password_and_bad_email():
    assert signup("short@test.dev", "1234567").status_code == 422
    assert signup("not-an-email").status_code == 400


def test_wrong_password_and_unknown_user_same_message():
    signup("bob@test.dev")
    a = c.post("/api/auth/login", json={"email": "bob@test.dev", "password": "wrongpass1"})
    b = c.post("/api/auth/login", json={"email": "nobody@test.dev", "password": "wrongpass1"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"]          # 가입 여부를 알려주지 않음


def test_password_is_hashed_not_stored():
    from app.db import SessionLocal
    from app.models import User
    signup("hash@test.dev", "plaintext-pw")
    with SessionLocal() as db:
        u = db.query(User).filter_by(email="hash@test.dev").one()
        assert "plaintext-pw" not in u.password_hash and u.password_hash.startswith("$argon2")


def test_bad_missing_and_expired_tokens():
    assert c.get("/api/auth/me").status_code == 401
    assert c.get("/api/auth/me", headers=bearer("garbage")).status_code == 401
    forged = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "wrong-secret", algorithm="HS256")
    assert c.get("/api/auth/me", headers=bearer(forged)).status_code == 401
    expired = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                         config.JWT_SECRET, algorithm="HS256")
    assert c.get("/api/auth/me", headers=bearer(expired)).status_code == 401
