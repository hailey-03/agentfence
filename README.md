# AgentFence

AI 에이전트의 도구 호출을 **사용자 요청 기준으로** 실행 전에 검사하고,
같은 문서로 4가지 방어 조건(A 방어 없음 · B AWS식 권한표 · C AgentFence · D Guardrails)을 비교하는 도구.
설계 원본은 PRD 문서.

## 진행 상황

| 순서 | 모듈 | 담당 | 상태 |
| --- | --- | --- | --- |
| 1 | 앱 뼈대 `main.py` `db.py` `models.py` `config.py` + 공통 형식 `schemas.py` | 공동 | 완료 |
| 2 | 가입·로그인 `auth.py` | A | 완료 |
| 3 | 정책 게이트 `policy.py` + 도구 목록 `catalog.py` | B | 완료 |
| 4 | Mock 도구 `mock_tools.py` · LLM·Guardrails 래퍼 `llm.py` | C | 완료 |
| 5 | Planner `planner.py` | B | 완료 |
| 6 | 시뮬레이터 `simulator.py` | C | 완료 |
| 7 | 시나리오·실행 API `scenarios.py` | A | 완료 |
| 8 | 실험 `eval/` | C | 완료 |
| 9 | 화면 `web/` | A (S3 계획 편집은 B) | 완료 (리포트 화면 포함) |

## 폴더 구조

```
app/
  config.py    환경 변수, 조건 B 권한표(허용 도구·도메인)
  db.py        SQLite 연결, get_db()
  models.py    테이블 4개: users, scenarios, runs, eval_reports
  schemas.py   공통 형식: Plan, ToolCall, RunState, Decision, TraceEvent, GuardrailResult, 규칙 ID
  catalog.py   도구 4개의 위험 등급·입력 형식·Bedrock 도구 정의 (게이트와 Mock이 함께 씀)
  policy.py    정책 게이트: evaluate() → Decision, after_execute(), denied_message()
  auth.py      /api/auth/signup · login · me, current_user 의존성
  mock_tools.py  가짜 도구 4개 + Run별 카나리
  llm.py       Bedrock Converse · Guardrails(ApplyGuardrail) 래퍼, 가짜 LLM(FakeClient)
  planner.py   요청 + 도구 정의 → 계획 초안 (PDF는 받지 않음), validate_plan()
  simulator.py   AI에게 요청+PDF를 주고 도구 호출을 게이트로 거르며 실행
  scenarios.py   시나리오·계획·실행·Run API
scripts/try_it.py  1~5번 모듈 체험 스크립트
eval/make_docs.py  시연용 PDF 생성 (PyMuPDF 필요)
  scenarios.py   시나리오·계획·실행·Run·리포트 API
eval/dataset.py  실험 문서 12개 (정상 6 + 공격 6)
eval/goals.py    공격 성공 판정 (실행된 호출만 봄)
eval/run_eval.py 일괄 실험: 문서 × 조건 × 반복 → 지표 집계
web/           React 화면 S1~S5 (로그인·시나리오·계획·결과·실험 리포트)
  main.py      앱 진입점, /api/health, React 빌드 서빙
tests/         pytest
eval/          실험 문서·스크립트 (8번 모듈)
web/           React 화면 (9번 모듈)
```

## 실행

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m pytest -q                # 62 passed 가 나오면 정상
python -m scripts.try_it           # 계획 만들기 · 게이트 B vs C · Guardrails 체험
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

### 실험 돌리기 (발표용 숫자·그래프)

```bash
python -m eval.run_eval          # 문서 12 × 조건 4 × 반복 3 = 144 Run
REPEATS=1 python -m eval.run_eval  # 빠르게 1회
```

끝나면 터미널에 조건별 공격 성공률·정상 업무 성공률·오탐률 표가 나오고,
웹 상단 "실험 리포트" 메뉴에서 막대그래프와 문서×조건 격자로 볼 수 있다.

회사 PC에서 라이브러리 DLL이 보안 정책에 막히면(예: "애플리케이션 제어 정책에서 이 파일을 차단했습니다")
GitHub Codespaces에서 같은 명령을 실행한다.

## 도구 카탈로그 (14개)

AI에게 '날것의 SQL' 같은 넓은 권한을 주지 않고, 대상을 인자로 받는 '좁은 도구'만 노출한다.
run_sql·drop_table 같은 위험 도구는 카탈로그에 아예 없어 호출해도 거부된다 (설계 단계 방어).

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
- 규칙 ID는 `RuleId`에 있는 것만 쓴다. 평가 순서도 그 순서를 따른다.

## 정책 게이트 사용법 (시뮬레이터 담당 C 참고)

```python
from app.policy import evaluate, after_execute, denied_message
from app.schemas import ToolCall, RunState

state = RunState(task=요청원문, canary=이번Run카나리)
d = evaluate(ToolCall(seq=n, tool=이름, args=인자), state, 확정계획, 조건)
if d.decision == "ALLOW":
    결과 = Mock 실행
    after_execute(state, call)     # 실행된 경우에만
    d.executed = True
else:
    결과 = denied_message(d)       # 모델에게 돌려줄 거부 문장
# d 를 Trace와 runs.decisions 에 저장
```

조건 A·D는 아무것도 막지 않지만 `wouldDeny`에 "C였다면 걸렸을 규칙"이 기록된다.
