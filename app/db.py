from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

# check_same_thread는 SQLite 전용 옵션 (테스트용). MariaDB는 끊긴 연결을 pool_pre_ping으로 걸러낸다
_connect_args = {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(config.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI 의존성: 요청마다 세션 하나."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
