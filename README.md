# AgentFence

AI 에이전트를 실제로 쓰기 전에, **사용자 요청에 없던 행동**을 하는지 찾아내는 도구.
문서(PDF)와 요청을 주고 도구 호출을 막지 않은 채 모두 가짜(Mock)로 실행한 뒤, 요청에서 만든 계획과 비교한다(MATCH / DIFFERENT).
설계 원본은 PRD 문서.

## 진행 상황

| 순서 | 모듈 | 담당 | 상태 |
| --- | --- | --- | --- |
| 1 | 앱 뼈대 `main.py` `db.py` `models.py` `config.py` + 공통 형식 `schemas.py` | 공동 | 완료 |
| 2 | 가입·로그인 `auth.py` | A | 완료 |
| 3 | 도구 목록 `catalog.py` (정책 게이트 `policy.py`는 v0.8에서 삭제) | B | 완료 |
| 4 | Mock 도구 `mock_tools.py` · LLM·Guardrails 래퍼 `llm.py` | C | 완료 |
| 5 | Planner `planner.py` | B | 완료 |
| 6 | 시뮬레이터 `simulator.py` | C | 완료 |
| 7 | 시나리오·실행 API `scenarios.py` | A | 완료 |
| 8 | 시연 PDF 생성 `eval/make_docs.py` (실험 코드는 v0.8에서 삭제) | C | 완료 |
| 9 | 화면 `web/` | A (S3 계획 편집은 B) | 완료 |

## 폴더 구조

```
app/
  config.py    환경 변수, 시뮬레이션 제한값
  db.py        MariaDB 연결, get_db() (테스트는 SQLite)
  models.py    테이블 4개: users, scenarios, runs, eval_reports
  schemas.py   공통 형식: Plan, ToolCall, RunState, Decision, TraceEvent, GuardrailResult, 규칙 ID
  catalog.py   도구 14개의 설명·위험 등급·입력 형식·Bedrock 도구 정의
  auth.py      /api/auth/signup · /api/auth/login · /api/users/me, CurrentUser 의존성 (bcrypt · JWT)
  mock_tools.py  가짜 도구 14개 (순수 함수, 같은 입력에 같은 결과)
  llm.py       Bedrock Converse · Guardrails(ApplyGuardrail) 래퍼, 가짜 LLM(FakeClient)
  planner.py   요청 + 도구 정의 → 계획 초안 (PDF는 받지 않음), validate_plan()
  simulator.py   AI에게 요청+PDF를 주고 도구 호출을 모두 Mock으로 실행
  scenarios.py   시나리오·계획·실행·Run API
scripts/try_it.py  계획 만들기 → 시뮬레이션 실행 체험 스크립트
eval/make_docs.py  시연용 PDF 생성 (PyMuPDF 필요)
web/           React 화면 S1~S4 (로그인·시나리오·계획·결과)
  main.py      앱 진입점, /api/health, React 빌드 서빙
tests/         pytest
eval/          시연 PDF 생성 스크립트
web/           React 화면 (9번 모듈)
```

## 실행

DB는 MariaDB다. 로컬에서는 docker compose로 띄운다 (Codespaces는 시작할 때 자동으로 뜬다).

```bash
docker compose up -d               # MariaDB 11.4 (127.0.0.1:3306)
cp .env.example .env               # JWT_SECRET_KEY 꼭 변경. 비어 있으면 앱이 뜨지 않음
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m pytest -q                # 42 passed, 11 skipped 면 정상. pip install pymupdf 후에는 53 passed (MariaDB 없이 SQLite로 돈다)
python -m scripts.try_it           # 계획 만들기 → 시뮬레이션 실행 → 계획 vs 실제 호출 수
uvicorn app.main:app --reload --port 8000
```

### 웹 화면으로 쓰기

터미널 두 개를 쓴다.

```bash
# 터미널 1: 백엔드
uvicorn app.main:app --reload --port 8000

# 터미널 2: 화면 (처음 한 번 cd web && npm install)
cd web && npm run dev
```

터미널 2가 안내하는 주소(보통 http://localhost:5173)를 연다.
Codespaces에서는 아래 PORTS 탭에서 5173 포트의 지구본 아이콘을 누른다.
시연용 PDF가 필요하면 `pip install pymupdf && python -m eval.make_docs` 로 `eval/datasets/` 에 만든다.

API만 눌러보려면 http://localhost:8000/docs 를 연다.

회사 PC에서 라이브러리 DLL이 보안 정책에 막히면(예: "애플리케이션 제어 정책에서 이 파일을 차단했습니다")
GitHub Codespaces에서 같은 명령을 실행한다.

## 도구 카탈로그 (14개)

AI에게 '날것의 SQL' 같은 넓은 권한을 주지 않고, 대상을 인자로 받는 '좁은 도구'만 노출한다.
run_sql·drop_table 같은 위험 도구는 카탈로그에 아예 없어 호출해도 실행되지 않는다 (설계 단계 방어).

| 위험 등급 | 도구 |
| --- | --- |
| 내부 쓰기 | summarize_note, update_doc, create_calendar_event, update_record |
| 민감 읽기 | read_private_note, read_hr_record, search_internal_docs, query_customer_db, query_employee_db |
| 외부 전송 | send_email, post_to_slack, share_external_link, export_table |
| 파괴적 | delete_file |

새 도구를 더하려면 `app/catalog.py`에 등급·설명·인자를 적고, `app/mock_tools.py`에 가짜 결과를 추가한다.

## 공통 형식 규칙

- 모듈 사이에는 dict 대신 `app/schemas.py`의 모델을 주고받는다.
- `schemas.py`를 바꿀 때는 세 명 모두에게 알린다.

