"""시나리오·계획·실행 API (PRD F2·F3·F5·8.4)."""
import io
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, UploadFile
from pypdf import PdfReader
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, defer, load_only

from . import config
from .auth import current_user
from .catalog import TOOLS
from .diff import diff, tool_calls
from .db import get_db
from .llm import get_client
from .models import Run, Scenario, User
from .planner import PlannerError, generate_plan, validate_plan
from .schemas import Condition, Decision, DiffResult, Plan, TraceEvent
from .simulator import run as run_sim

logging.getLogger("pypdf").setLevel(logging.ERROR)
router = APIRouter(tags=["scenarios"])
# 경로의 ID. BIGINT 범위 밖(0 이하·너무 큰 수)은 DB에 묻기 전에 422로 거른다 (SQLite는 범위 초과 시 500)
Id = Annotated[int, Path(ge=1, le=2**63 - 1)]


# ---------- 응답 형식 ----------
class ToolInfo(BaseModel):
    name: str
    description: str
    risk: str
    params: dict[str, str] = {}     # 입력값 이름 → 설명 (도구 소개 화면용)


class ScenarioBrief(BaseModel):
    id: int
    task: str
    pdf_name: str
    tools: list[str]
    plan_confirmed: bool
    created_at: str
    run_count: int = 0


class RunBrief(BaseModel):
    id: int
    condition: str
    status: str
    result: str | None              # MATCH | DIFFERENT (DONE인 Run만)


class ScenarioDetail(ScenarioBrief):
    plan: Plan | None
    plan_draft: Plan | None         # AI 초안 원본 (확정 후 비교용). 이 기능 이전에 만든 계획은 None
    pdf_chars: int
    runs: list[RunBrief]


class RunDetail(BaseModel):
    id: int
    scenario_id: int
    condition: str
    status: str
    plan: Plan
    trace: list[TraceEvent]
    decisions: list[Decision]
    final_output: str | None
    diff: DiffResult | None         # 계획 vs 실제 비교 (F7). DONE인 Run만
    error: str | None = None        # FAILED일 때 오류 메시지


class RunRequest(BaseModel):
    condition: Condition = "C"
    model: str | None = None            # 실행에 쓸 Bedrock 모델 ID. None이면 서버 기본값.


# ---------- 공통 ----------
def _own(db: Session, user: User, sid: int) -> Scenario:
    s = db.get(Scenario, sid)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "시나리오를 찾을 수 없습니다.")
    return s


def extract_pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        raise ValueError("암호가 걸린 PDF")
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def _brief(s: Scenario, run_count: int = 0) -> dict:
    return dict(id=s.id, task=s.task, pdf_name=s.pdf_name, tools=json.loads(s.tools),
                plan_confirmed=bool(s.plan_confirmed), created_at=s.created_at, run_count=run_count)


def run_diff(run: Run) -> DiffResult | None:
    """저장된 계획 복사본과 Trace로 계획 vs 실제를 비교한다. 끝까지 실행된 Run만."""
    if run.status != "DONE":
        return None
    trace = [TraceEvent.model_validate(e) for e in json.loads(run.trace or "[]")]
    return diff(Plan.model_validate_json(run.plan), tool_calls(trace))


# ---------- 엔드포인트 ----------
@router.get("/tools", response_model=list[ToolInfo])
def list_tools():
    return [ToolInfo(name=n, description=t["description"], risk=t["risk"], params=t.get("params", {})) for n, t in TOOLS.items()]


@router.get("/models")
def list_models():
    """실행에서 고를 수 있는 모델 목록 (label, id). 기본값도 알려준다."""
    return {"models": [{"id": v, "label": k} for k, v in config.SELECTABLE_MODELS.items()],
            "default": config.BEDROCK_MODEL_ID}


@router.post("/scenarios", response_model=ScenarioBrief, status_code=201)
async def create_scenario(task: str = Form(...), pdf: UploadFile = File(...),
                          user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    task = task.strip()
    if not task:
        raise HTTPException(400, "요청을 입력하세요.")
    if len(task) > config.MAX_TASK_CHARS:
        raise HTTPException(400, f"요청은 {config.MAX_TASK_CHARS}자 이하로 입력하세요.")
    data = await pdf.read(config.MAX_PDF_BYTES + 1)
    if len(data) > config.MAX_PDF_BYTES:
        raise HTTPException(400, "PDF는 10MB 이하만 올릴 수 있습니다.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(400, "PDF 파일이 아닙니다.")
    try:
        text = extract_pdf_text(data)
    except Exception:
        raise HTTPException(400, "PDF를 읽지 못했습니다. 암호가 걸렸거나 손상된 파일인지 확인하세요.")
    if not text.strip():  # 스캔한 이미지 PDF 등. Agent가 읽을 내용이 없어 실험이 의미 없음
        raise HTTPException(400, "PDF에서 글자를 읽지 못했습니다. 스캔한 이미지 PDF는 지원하지 않습니다.")
    # 노출 도구는 서버가 정한다: 만들 때의 카탈로그 전체를 시나리오에 저장해 둔다.
    # 계획은 비워 둔다. 초안(plan_draft)은 서버의 Planner만 만든다 (POST /scenarios/{id}/plan)
    s = Scenario(user_id=user.id, task=task, tools=json.dumps(list(TOOLS)),
                 pdf_name=(pdf.filename or "document.pdf")[:200], pdf_text=text)
    db.add(s)
    db.commit()
    return _brief(s)


@router.get("/scenarios", response_model=list[ScenarioBrief])
def list_scenarios(user: User = Depends(current_user), db: Session = Depends(get_db)):
    # 목록에는 PDF 본문(LONGTEXT, 수 MB)이 필요 없으므로 읽지 않는다
    rows = db.scalars(select(Scenario).options(defer(Scenario.pdf_text))
                      .where(Scenario.user_id == user.id).order_by(Scenario.id.desc())).all()
    counts = dict(db.execute(select(Run.scenario_id, func.count(Run.id))
                             .where(Run.scenario_id.in_([s.id for s in rows])).group_by(Run.scenario_id)).all())
    return [_brief(s, counts.get(s.id, 0)) for s in rows]


@router.get("/scenarios/{sid}", response_model=ScenarioDetail)
def get_scenario(sid: Id, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    # 실행 목록에는 요약 칸 + F7 비교(run_diff)에 쓰는 계획·Trace만 읽는다. 결정 기록·최종 출력은 실행 상세에서만
    runs = db.scalars(select(Run).options(load_only(Run.id, Run.condition, Run.status, Run.plan, Run.trace))
                      .where(Run.scenario_id == sid).order_by(Run.id.desc())).all()
    return ScenarioDetail(**_brief(s, len(runs)),
                          plan=Plan.model_validate_json(s.plan) if s.plan else None,
                          plan_draft=Plan.model_validate_json(s.plan_draft) if s.plan_draft else None,
                          pdf_chars=len(s.pdf_text),
                          runs=[RunBrief(id=r.id, condition=r.condition, status=r.status,
                                         result=(d.result if (d := run_diff(r)) else None))
                                for r in runs])


@router.post("/scenarios/{sid}/plan", response_model=Plan)
def make_plan(sid: Id, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    try:
        plan = generate_plan(s.task, json.loads(s.tools), get_client())   # PDF 미전달
    except PlannerError as e:
        raise HTTPException(502, str(e))
    s.plan, s.plan_confirmed = plan.model_dump_json(), 0
    s.plan_draft = s.plan                      # AI 초안 원본은 따로 남긴다 (확정해도 그대로)
    db.commit()
    return plan


@router.put("/scenarios/{sid}/plan", response_model=Plan)
def confirm_plan(sid: Id, body: Plan, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    try:
        plan = validate_plan(body, json.loads(s.tools))
    except ValueError as e:
        raise HTTPException(400, str(e))
    s.plan, s.plan_confirmed = plan.model_dump_json(), 1
    db.commit()
    return plan


@router.post("/scenarios/{sid}/runs", response_model=RunDetail)
def create_run(sid: Id, body: RunRequest, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    if not s.plan or not s.plan_confirmed:
        raise HTTPException(400, "계획을 확정한 뒤 실행할 수 있습니다.")
    if body.model and body.model not in config.SELECTABLE_MODELS.values():
        raise HTTPException(400, "허용되지 않은 모델입니다.")
    run = Run(scenario_id=s.id, condition=body.condition, status="DONE", plan=s.plan)
    try:
        # model은 이 실행에만 적용(계획은 서버 기본 모델). None이면 서버 기본값.
        out = run_sim(s.task, s.pdf_text, json.loads(s.tools), get_client(), model=body.model)
        run.trace = json.dumps([e.model_dump() for e in out["trace"]], ensure_ascii=False)
        run.final_output = out["final_output"]
    except Exception as e:
        run.status, run.error = "FAILED", str(e)
    db.add(run)
    db.commit()
    return _run_detail(run)


@router.get("/runs/{rid}", response_model=RunDetail)
def get_run(rid: Id, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(Run, rid)
    if run is None:
        raise HTTPException(404, "실행 결과를 찾을 수 없습니다.")
    _own(db, user, run.scenario_id)
    return _run_detail(run)


def _run_detail(run: Run) -> RunDetail:
    return RunDetail(
        id=run.id, scenario_id=run.scenario_id, condition=run.condition, status=run.status,
        plan=Plan.model_validate_json(run.plan),
        trace=[TraceEvent.model_validate(e) for e in json.loads(run.trace or "[]")],
        decisions=[Decision.model_validate(d) for d in json.loads(run.decisions or "[]")],
        final_output=run.final_output,
        diff=run_diff(run), error=run.error)
