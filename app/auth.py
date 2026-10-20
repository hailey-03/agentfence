"""가입·로그인 (PRD F1). 비밀번호는 bcrypt, 로그인 결과는 JWT(HS256) 액세스 토큰.

  POST /api/auth/signup  JSON {email, password, nickname} → 201 사용자 정보 / 중복 이메일 409
                         password: 8자 이상, 대문자·소문자·숫자·특수문자 각 1개 이상, 72바이트 이하
  POST /api/auth/login   form {username=이메일, password} → {access_token, token_type} / 실패 401
  GET  /api/users/me     Bearer 토큰 → 사용자 정보 / 토큰 없거나 무효 401

다른 라우터에서 로그인 사용자 얻기:
    from .auth import CurrentUser
    def handler(user: CurrentUser): ...
"""
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User

router = APIRouter(tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
DbSession = Annotated[Session, Depends(get_db)]

BCRYPT_MAX_BYTES = 72  # bcrypt는 72바이트까지만 쓴다 (한글은 글자당 3바이트)
# 가입 비밀번호 규칙: 8자 이상 + 아래 네 종류를 각각 하나 이상 (로그인 때는 검사하지 않음 — 기존 계정 보호)
PASSWORD_RULES = [
    (re.compile(r"[A-Z]"), "영문 대문자"),
    (re.compile(r"[a-z]"), "영문 소문자"),
    (re.compile(r"[0-9]"), "숫자"),
    (re.compile(r"[^A-Za-z0-9\s]"), "특수문자"),
]


# ---------- 비밀번호 · 토큰 ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# 없는 이메일로 로그인해도 같은 시간이 걸리게 하는 비교용 해시 (가입 여부 노출 방지)
_DUMMY_HASH = hash_password("dummy-password-for-timing")


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "iat": now,
               "exp": now + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


# ---------- 요청·응답 형식 ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    nickname: str = Field(min_length=1, max_length=50)

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.lower()  # Alice@x.dev 와 alice@x.dev 를 같은 계정으로

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        if len(v.encode()) > BCRYPT_MAX_BYTES:
            raise ValueError(f"비밀번호는 {BCRYPT_MAX_BYTES}바이트 이하여야 합니다. (한글은 글자당 3바이트)")
        missing = [name for pattern, name in PASSWORD_RULES if not pattern.search(v)]
        if missing:
            raise ValueError(f"비밀번호에 {'·'.join(missing)}를 하나 이상 넣어 주세요.")
        return v

    @field_validator("nickname")
    @classmethod
    def strip_nickname(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("닉네임을 입력하세요.")
        return v.strip()


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    nickname: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- 의존성 ----------

def current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증 정보가 유효하지 않습니다.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user_id = decode_access_token(token)
    if user_id is None or not str(user_id).isdigit():
        raise credentials_error
    user = db.get(User, int(user_id))
    if user is None:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(current_user)]


# ---------- 라우터 ----------

@router.post("/auth/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(body: UserCreate, db: DbSession):
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 가입된 이메일입니다.")
    user = User(email=body.email, password_hash=hash_password(body.password), nickname=body.nickname)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/auth/login", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession):
    # OAuth2 표준 폼이라 필드명이 username이지만, 값으로 이메일을 넣는다.
    user = db.scalar(select(User).where(User.email == form.username.strip().lower()))
    # 72바이트 초과 비밀번호는 bcrypt가 오류를 내므로 비교 전에 실패 처리 (가입 시 이미 막혀 있음)
    too_long = len(form.password.encode()) > BCRYPT_MAX_BYTES
    valid = not too_long and verify_password(form.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.",
                            headers={"WWW-Authenticate": "Bearer"})
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/users/me", response_model=UserRead)
def read_me(user: CurrentUser):
    return user
