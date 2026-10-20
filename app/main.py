import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from . import config, models  # noqa: F401  (models import 시 테이블이 Base에 등록됨)
from .auth import router as auth_router
from .scenarios import router as scenarios_router
from .db import Base, engine

if not config.JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY가 비어 있습니다. .env.example을 .env로 복사하고 값을 넣으세요.")

# 개발 초기용. 팀에서 Alembic을 도입하면 이 줄은 제거한다.
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
