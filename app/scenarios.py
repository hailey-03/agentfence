"""시나리오·계획·실행 API (PRD F2·F3·F5·8.4)."""
import io
import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pypdf import PdfReader
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config
from .auth import current_user
from .catalog import TOOLS
from .db import get_db
from .llm import get_client
from .models import Run, Scenario, User
from .planner import PlannerError, generate_plan, validate_plan
from .schemas import Condition, Decision, Plan, ToolCall, TraceEvent
from .simulator import run as run_sim

logging.getLogger("pypdf").setLevel(logging.ERROR)
router = APIRouter(tags=["scenarios"])


# ---------- 응답 형식 ----------
class ToolInfo(BaseModel):
    name: str
    description: str
    risk: str


class ScenarioBrief(BaseModel):
    id: int
    task: str
    pdf_name: str
    tools: list[str]
    plan_confirmed: bool


class RunBrief(BaseModel):
    id: int
    condition: str
    status: str
    task_success: bool | None


class ScenarioDetail(ScenarioBrief):
    plan: Plan | None
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
    task_success: bool | None


class RunRequest(BaseModel):
    condition: Condition = "C"


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


def _brief(s: Scenario) -> dict:
    return dict(id=s.id, task=s.task, pdf_name=s.pdf_name, tools=json.loads(s.tools),
                plan_confirmed=bool(s.plan_confirmed))


def task_succeeded(plan: Plan, tool_calls: list[ToolCall], stop_ok: bool) -> bool:
    """MUST 도구가 모두 호출됐고 종료가 정상이면 업무 성공."""
    done = {}
    for c in tool_calls:
        done[c.tool] = done.get(c.tool, 0) + 1
    for r in plan.tools:
        if r.rule == "MUST" and done.get(r.tool, 0) < 1:
            return False
    return stop_ok


# ---------- 엔드포인트 ----------
@router.get("/tools", response_model=list[ToolInfo])
def list_tools():
    return [ToolInfo(name=n, description=t["description"], risk=t["risk"]) for n, t in TOOLS.items()]


@router.post("/scenarios", response_model=ScenarioBrief)
async def create_scenario(task: str = Form(...), tools: str = Form(...),
                          pdf: UploadFile = File(...), user: User = Depends(current_user),
                          db: Session = Depends(get_db)):
    task = task.strip()
    if not task:
        raise HTTPException(400, "요청을 입력하세요.")
    try:
        names = json.loads(tools)
    except json.JSONDecodeError:
        raise HTTPException(400, "도구 목록 형식이 올바르지 않습니다.")
    if not names or any(t not in TOOLS for t in names):
        raise HTTPException(400, "노출 도구를 하나 이상 올바르게 고르세요.")
    data = await pdf.read(config.MAX_PDF_BYTES + 1)
    if len(data) > config.MAX_PDF_BYTES:
        raise HTTPException(400, "PDF는 10MB 이하만 올릴 수 있습니다.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(400, "PDF 파일이 아닙니다.")
    try:
        text = extract_pdf_text(data)
    except Exception:
        raise HTTPException(400, "PDF를 읽지 못했습니다. 암호가 걸렸거나 손상된 파일인지 확인하세요.")
    s = Scenario(user_id=user.id, task=task, tools=json.dumps(names),
                 pdf_name=(pdf.filename or "document.pdf")[:200], pdf_text=text)
    db.add(s)
    db.commit()
    return _brief(s)


@router.get("/scenarios", response_model=list[ScenarioBrief])
def list_scenarios(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Scenario).where(Scenario.user_id == user.id)
                      .order_by(Scenario.id.desc())).all()
    return [_brief(s) for s in rows]


@router.get("/scenarios/{sid}", response_model=ScenarioDetail)
def get_scenario(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    runs = db.scalars(select(Run).where(Run.scenario_id == sid).order_by(Run.id.desc())).all()
    return ScenarioDetail(**_brief(s),
                          plan=Plan.model_validate_json(s.plan) if s.plan else None,
                          pdf_chars=len(s.pdf_text),
                          runs=[RunBrief(id=r.id, condition=r.condition, status=r.status,
                                         task_success=bool(r.task_success) if r.task_success is not None else None)
                                for r in runs])


@router.post("/scenarios/{sid}/plan", response_model=Plan)
def make_plan(sid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    try:
        plan = generate_plan(s.task, json.loads(s.tools), get_client())   # PDF 미전달
    except PlannerError as e:
        raise HTTPException(502, str(e))
    s.plan, s.plan_confirmed = plan.model_dump_json(), 0
    db.commit()
    return plan


@router.put("/scenarios/{sid}/plan", response_model=Plan)
def confirm_plan(sid: int, body: Plan, user: User = Depends(current_user),
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
def create_run(sid: int, body: RunRequest, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    s = _own(db, user, sid)
    if not s.plan or not s.plan_confirmed:
        raise HTTPException(400, "계획을 확정한 뒤 실행할 수 있습니다.")
    plan = Plan.model_validate_json(s.plan)
    run = Run(scenario_id=s.id, condition=body.condition, status="DONE", plan=s.plan)
    try:
        out = run_sim(s.task, s.pdf_text, json.loads(s.tools), get_client())
        run.trace = json.dumps([e.model_dump() for e in out["trace"]], ensure_ascii=False)
        run.final_output = out["final_output"]
        run.task_success = int(task_succeeded(plan, out["tool_calls"], out["final_output"] is not None))
    except Exception as e:
        run.status, run.error = "FAILED", str(e)
    db.add(run)
    db.commit()
    return _run_detail(run)


@router.get("/runs/{rid}", response_model=RunDetail)
def get_run(rid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
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
        task_success=bool(run.task_success) if run.task_success is not None else None)
