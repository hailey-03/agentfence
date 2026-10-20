"""가입·로그인 (PRD F1). 비밀번호는 Argon2, 로그인 결과는 JWT.

다른 라우터에서 로그인 사용자 얻기:
    from .auth import current_user
    def handler(user: User = Depends(current_user)): ...
"""
import re
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User

router = APIRouter(prefix="/auth", tags=["auth"])
hasher = PasswordHash.recommended()            # Argon2
bearer = HTTPBearer(auto_error=False)
EMAIL_FORMAT = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# 없는 이메일로 로그인해도 같은 시간이 걸리게 하는 비교용 해시 (가입 여부 노출 방지)
_DUMMY_HASH = hasher.hash("dummy-password-for-timing")


class Credentials(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    token: str


class Me(BaseModel):
    id: int
    email: str


def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=config.JWT_EXPIRE_HOURS)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요합니다.",
                                 headers={"WWW-Authenticate": "Bearer"})
    if cred is None:
        raise unauthorized
    try:
        payload = jwt.decode(cred.credentials, config.JWT_SECRET, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    if user is None:
        raise unauthorized
    return user


@router.post("/signup", response_model=TokenOut)
def signup(body: Credentials, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_FORMAT.match(email):
        raise HTTPException(400, "이메일 형식이 아닙니다.")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "이미 가입된 이메일입니다.")
    user = User(email=email, password_hash=hasher.hash(body.password))
    db.add(user)
    db.commit()
    return TokenOut(token=create_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(body: Credentials, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    valid = hasher.verify(body.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(401, "이메일 또는 비밀번호가 맞지 않습니다.")
    return TokenOut(token=create_token(user.id))


@router.get("/me", response_model=Me)
def me(user: User = Depends(current_user)):
    return Me(id=user.id, email=user.email)
