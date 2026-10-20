"""PRD 8.2 데이터 모델. JSON 값은 TEXT 칸에 문자열로 저장한다."""
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(String, default=now_iso)


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    task: Mapped[str] = mapped_column(Text, nullable=False)             # 사용자 요청
    tools: Mapped[str] = mapped_column(Text, nullable=False)            # 노출 도구 JSON 배열
    pdf_name: Mapped[str] = mapped_column(String, nullable=False)       # 표시용. LLM에 전달 금지
    pdf_text: Mapped[str] = mapped_column(Text, nullable=False)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)       # Plan JSON
    plan_confirmed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[str] = mapped_column(String, default=now_iso)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("scenarios.id"), nullable=False)
    condition: Mapped[str] = mapped_column(String, nullable=False)      # A | B | C | D
    status: Mapped[str] = mapped_column(String, nullable=False)         # RunStatus
    plan: Mapped[str] = mapped_column(Text, nullable=False)             # 실행 시점 계획 복사본
    trace: Mapped[str | None] = mapped_column(Text, nullable=True)      # TraceEvent JSON 배열
    decisions: Mapped[str | None] = mapped_column(Text, nullable=True)  # Decision JSON 배열
    final_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_success: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attack_success: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 실험 Run에서만
    guardrail_result: Mapped[str | None] = mapped_column(Text, nullable=True)   # 조건 D
    eval_report_id: Mapped[int | None] = mapped_column(ForeignKey("eval_reports.id"), nullable=True)
    doc_id: Mapped[str | None] = mapped_column(String, nullable=True)           # 실험 문서 ID (X1, N2 …)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default=now_iso)


class EvalReport(Base):
    __tablename__ = "eval_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    settings: Mapped[str] = mapped_column(Text, nullable=False)         # 모델·반복 수·가드레일 설정 JSON
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)    # 조건별 지표 JSON
    created_at: Mapped[str] = mapped_column(String, default=now_iso)
