"""PRD 8.2 데이터 모델. JSON 값은 TEXT 칸에 문자열로 저장한다.

DB는 MariaDB. 테스트만 SQLite로 돌린다 (tests/conftest.py).
"""
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

# MariaDB에서는 BIGINT, 테스트용 SQLite에서는 INTEGER(자동증가 지원).
# FK 칸은 ForeignKey가 참조 칸의 타입을 따라가므로 따로 지정하지 않는다 (MariaDB는 FK 양쪽 타입이 같아야 함)
PK = BigInteger().with_variant(Integer, "sqlite")
# MariaDB의 TEXT는 64KB까지라 PDF 본문·Trace JSON이 잘린다 → LONGTEXT(4GB)
BigText = Text().with_variant(LONGTEXT(), "mysql", "mariadb")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(PK, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[int] = mapped_column(PK, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    task: Mapped[str] = mapped_column(Text, nullable=False)             # 사용자 요청
    tools: Mapped[str] = mapped_column(Text, nullable=False)            # 노출 도구 JSON 배열
    pdf_name: Mapped[str] = mapped_column(String(255), nullable=False)  # 표시용. LLM에 전달 금지
    pdf_text: Mapped[str] = mapped_column(BigText, nullable=False)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)       # Plan JSON (사용자가 고친·확정한 계획)
    plan_draft: Mapped[str | None] = mapped_column(Text, nullable=True) # AI가 만든 초안 원본. 확정 후 비교용
    plan_confirmed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[int] = mapped_column(PK, primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)   # 이 실행에 쓴 Bedrock 모델 ID
    status: Mapped[str] = mapped_column(String(32), nullable=False)     # RunStatus
    plan: Mapped[str] = mapped_column(Text, nullable=False)             # 실행 시점 계획 복사본
    trace: Mapped[str | None] = mapped_column(BigText, nullable=True)      # TraceEvent JSON 배열
    decisions: Mapped[str | None] = mapped_column(BigText, nullable=True)  # Decision JSON 배열
    final_output: Mapped[str | None] = mapped_column(BigText, nullable=True)
    attack_success: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 실험 Run에서만
    guardrail_result: Mapped[str | None] = mapped_column(BigText, nullable=True)  # 조건 D
    eval_report_id: Mapped[int | None] = mapped_column(ForeignKey("eval_reports.id"), nullable=True)
    doc_id: Mapped[str | None] = mapped_column(String(32), nullable=True)       # 실험 문서 ID (X1, N2 …)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)


class EvalReport(Base):
    __tablename__ = "eval_reports"
    id: Mapped[int] = mapped_column(PK, primary_key=True, autoincrement=True)
    settings: Mapped[str] = mapped_column(Text, nullable=False)         # 모델·반복 수·가드레일 설정 JSON
    summary: Mapped[str | None] = mapped_column(BigText, nullable=True)  # 조건별 지표 JSON
    created_at: Mapped[str] = mapped_column(String(32), default=now_iso)
