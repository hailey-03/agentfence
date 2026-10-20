from sqlalchemy import create_engine, inspect, text
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


# create_all은 이미 있는 테이블에 컬럼을 더하지 않는다. 나중에 생긴 nullable 컬럼은 여기에 적어 두면
# 앱 시작 시 없을 때만 추가한다 (Alembic 도입 전까지의 임시 방편).
NEW_COLUMNS = {"scenarios": {"plan_draft": "TEXT"}}


def add_missing_columns(eng) -> list[str]:
    added = []
    for table, cols in NEW_COLUMNS.items():
        have = {c["name"] for c in inspect(eng).get_columns(table)}
        with eng.begin() as conn:
            for name, typ in cols.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {typ} NULL"))
                    added.append(f"{table}.{name}")
    return added
