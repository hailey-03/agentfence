import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config, models  # noqa: F401  (models import 시 테이블이 Base에 등록됨)
from .auth import router as auth_router
from .scenarios import router as scenarios_router
from .db import Base, engine

Base.metadata.create_all(engine)

app = FastAPI(title="AgentFence")


@app.get("/api/health")
def health():
    return {"ok": True, "llm": config.LLM_MODE, "guardrail": bool(config.GUARDRAIL_ID)}


app.include_router(auth_router, prefix="/api")
app.include_router(scenarios_router, prefix="/api")


# React 빌드 결과 서빙. 반드시 API 라우터 뒤에 둔다 (/api가 가려지지 않도록)
if os.path.isdir(config.WEB_DIST):
    app.mount("/", StaticFiles(directory=config.WEB_DIST, html=True), name="web")
