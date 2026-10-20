"""앱 시작 시 빠진 컬럼 추가 (기존 DB에 plan_draft가 없을 때)."""
from sqlalchemy import create_engine, inspect, text

from app.db import add_missing_columns


def test_adds_plan_draft_to_old_table_once(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE scenarios (id INTEGER PRIMARY KEY, plan TEXT)"))
        conn.execute(text("INSERT INTO scenarios (id, plan) VALUES (1, '{}')"))
    assert add_missing_columns(eng) == ["scenarios.plan_draft"]
    assert "plan_draft" in {c["name"] for c in inspect(eng).get_columns("scenarios")}
    with eng.connect() as conn:                                         # 기존 행은 그대로, 새 컬럼은 비어 있음
        assert conn.execute(text("SELECT plan, plan_draft FROM scenarios")).one() == ("{}", None)
    assert add_missing_columns(eng) == []                               # 두 번 돌려도 안전
