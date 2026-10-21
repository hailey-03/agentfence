# 1. 앱 시작과 요청 공통 처리

서버가 뜰 때 하는 일, 브라우저 요청이 서버에 닿는 경로, 그리고 모든 화면·API가 공통으로 거치는 처리(화면 라우팅, 토큰 첨부, 인증 확인, DB 세션, 오류 문장 변환)를 정리한다. 다른 문서의 그림에서는 이 부분을 생략한다.

[← 목차](README.md)

## 관련 파일

| 파일                                                                               | 하는 일                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [app/main.py](../../app/main.py)                                                    | 앱 진입점. 시작 검사, 테이블 생성, 라우터 연결, `/api/health`, React 빌드 서빙                 |
| [app/config.py](../../app/config.py)                                                | `.env`와 환경 변수 읽기, 고정 제한값. 다른 모듈은 설정을 여기서만 읽는다                       |
| [app/db.py](../../app/db.py)                                                        | DB 엔진, 요청마다 세션 1개(`get_db`), 빠진 컬럼 추가(`add_missing_columns`)                  |
| [app/models.py](../../app/models.py)                                                | 테이블 4개 정의 (import하면 `Base`에 등록됨)                                                   |
| [app/auth.py](../../app/auth.py#L117-L132)                                          | 인증 의존성 `current_user` (자세한 건 [02 문서](02-auth.md))                                    |
| [web/vite.config.ts](../../web/vite.config.ts)                                      | 개발 서버에서 `/api` 요청을 `localhost:8000`으로 넘기는 프록시                               |
| [web/src/main.tsx](../../web/src/main.tsx), [web/src/App.tsx](../../web/src/App.tsx) | React 시작, 해시 라우팅, 로그인 확인 껍데기 `Shell`                                            |
| [web/src/api.ts](../../web/src/api.ts)                                              | 모든 API 호출이 거치는 `api()`, 토큰 보관                                                      |
| 테스트                                                                             | [tests/test_skeleton.py](../../tests/test_skeleton.py), [tests/test_db.py](../../tests/test_db.py) |

---

## 1.1 서버 시작

`uvicorn app.main:app --reload --port 8000`을 실행하면 아래 순서로 준비한다.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as 개발자
    participant UV as uvicorn
    participant MA as main.py
    participant CF as config.py
    participant DBM as db.py
    participant AU as auth.py 등 라우터 모듈
    participant DB as MariaDB

    Dev->>UV: uvicorn app.main:app --port 8000
    UV->>MA: 모듈 불러오기
    MA->>CF: import
    CF->>CF: load_dotenv() - 프로젝트 .env 읽기 (이미 있는 환경 변수가 우선)
    MA->>DBM: import (models.py를 거쳐)
    DBM->>DBM: create_engine(DATABASE_URL, pool_pre_ping) - 아직 접속하지 않음
    MA->>AU: import auth.py, scenarios.py (planner, simulator, llm 등 함께)
    AU->>AU: _DUMMY_HASH 계산 (bcrypt 1번, 로그인 시간 맞추기용)
    break JWT_SECRET_KEY가 비어 있음
        MA-->>UV: RuntimeError - 앱이 뜨지 않음
    end
    MA->>DB: Base.metadata.create_all() - 없는 테이블만 만듦
    Note over MA,DB: DB에 접속하지 못하면 여기서 예외가 나서 앱이 뜨지 않는다
    MA->>DBM: add_missing_columns(engine)
    DBM->>DB: scenarios 테이블의 컬럼 목록 조회
    opt plan_draft 컬럼이 없음 (예전에 만든 DB)
        DBM->>DB: ALTER TABLE scenarios ADD COLUMN plan_draft TEXT NULL
    end
    MA->>MA: FastAPI 앱 생성, GET /api/health 등록
    MA->>MA: auth 라우터, scenarios 라우터를 /api 아래에 연결
    opt web/dist 폴더가 있음 (npm run build 결과)
        MA->>MA: "/"에 React 빌드 정적 파일 연결 (API 라우터 뒤에 두어 /api를 가리지 않음)
    end
    UV-->>Dev: 8000 포트에서 대기
    Note over MA: LLM 클라이언트는 이때 만들지 않는다.<br/>처음 계획·실행 요청이 올 때 get_client()가 만들고 계속 재사용한다
```

| 단계                     | 실패하면                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET_KEY` 확인  | `RuntimeError: JWT_SECRET_KEY가 비어 있습니다. .env.example을 .env로 복사하고 값을 넣으세요.` 로 종료 |
| `create_all` (DB 접속) | MariaDB가 꺼져 있으면 접속 오류로 종료. `docker compose up -d`로 먼저 띄운다                          |
| `add_missing_columns`  | 두 번 돌려도 안전하다 (없을 때만 추가)                                                                  |

- `create_all`은 이미 있는 테이블에 컬럼을 더하지 않는다. 나중에 생긴 nullable 컬럼은 `db.NEW_COLUMNS`에 적어 두면 시작할 때 추가된다. 지금은 `scenarios.plan_draft` 하나다 (Alembic 도입 전 임시 방편).
- 테스트([tests/conftest.py](../../tests/conftest.py))는 `LLM_MODE=fake`, `DATABASE_URL=sqlite:///./test_agentfence.db`, `JWT_SECRET_KEY=test-secret`을 넣고 같은 순서로 앱을 띄운다.

---

## 1.2 브라우저 요청이 서버에 닿는 길

개발 중에는 터미널 두 개를 쓴다. 화면은 Vite 개발 서버(5173), API는 uvicorn(8000)이다. 브라우저는 5173 하나만 보고, Vite가 `/api`로 시작하는 요청만 8000으로 넘긴다.

```mermaid
sequenceDiagram
    autonumber
    participant B as 브라우저
    participant V as Vite 개발 서버 (5173)
    participant F as FastAPI (8000)

    B->>V: GET http://localhost:5173/
    V-->>B: index.html, /src/main.tsx (TSX를 즉석 변환)
    B->>B: React 시작, 주소의 해시 부분으로 화면 결정 (1.3)
    B->>V: fetch /api/scenarios (같은 출처라 CORS 불필요)
    V->>F: 프록시 - http://localhost:8000/api/scenarios
    F-->>V: JSON
    V-->>B: JSON
```

`npm run build`로 `web/dist`를 만들면 FastAPI가 `/`에서 화면까지 내준다. 이때는 브라우저 → FastAPI(8000) 한 곳만 쓴다. 화면 주소가 해시(`#/scenarios/3`)라서 서버는 언제나 `index.html` 하나만 돌려주면 되고, `/api/...`는 정적 파일보다 먼저 등록돼 있어 API로 처리된다.

---

## 1.3 화면 라우팅과 로그인 확인 (App.tsx)

| 주소                | 화면                                                                   | 상단 바·사이드바(`Shell`) |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| `#/login`         | [Login.tsx](../../web/src/pages/Login.tsx) 가입·로그인                 | 없음                         |
| `#/`              | [Scenarios.tsx](../../web/src/pages/Scenarios.tsx) 새 시나리오          | 있음                         |
| `#/scenarios/:id` | [ScenarioDetail.tsx](../../web/src/pages/ScenarioDetail.tsx) 계획·실행 | 있음                         |
| `#/runs/:id`      | [RunResult.tsx](../../web/src/pages/RunResult.tsx) 결과                 | 있음                         |
| `#/me`            | [MyPage.tsx](../../web/src/pages/MyPage.tsx) 마이페이지                 | 있음                         |
| `#/tools`         | [ToolsGuide.tsx](../../web/src/pages/ToolsGuide.tsx) 도구 소개          | 있음                         |
| 그 밖               | `#/`로 이동                                                          | -                            |

```mermaid
sequenceDiagram
    autonumber
    participant B as 브라우저 주소
    participant APP as App.tsx (HashRouter)
    participant SH as Shell (App.tsx)
    participant LS as localStorage
    participant SB as Sidebar.tsx
    participant PG as 각 화면
    participant S as 서버

    B->>APP: 해시 주소 바뀜 (예: /scenarios/3)
    APP->>APP: 주소에 맞는 Route 찾기
    alt /login
        APP->>PG: Login 화면만 (Shell 없음)
    else 그 밖의 경로
        APP->>SH: Shell로 감싼 화면
        SH->>LS: getToken() - af_token
        alt 토큰 없음
            SH->>APP: Navigate - /login으로 교체 (서버에 묻지 않음)
        else 토큰 있음 (유효한지는 아직 모름)
            SH->>SB: 사이드바 그리기 (08 문서)
            SH->>PG: 화면 그리기
            opt Shell이 처음 붙을 때만 (로그인 직후, 새로고침)
                SH->>S: GET /api/users/me
                S-->>SH: 닉네임 → 상단 바 "닉네임 님" (실패하면 "마이페이지" 그대로)
            end
        end
    end
```

- 화면 사이를 옮겨 다녀도 `Shell`과 `Sidebar`는 새로 만들어지지 않고 안쪽 화면만 바뀐다 (모든 Route가 같은 `Shell`을 같은 자리에 두기 때문에 React가 재사용한다). 그래서 `/api/users/me`는 다시 부르지 않고, 사이드바는 주소가 바뀔 때마다 목록을 다시 부른다.
- 상단 바: `☰`(좁은 화면에서 사이드바 열기), `AgentFence`(→ `#/`), 메뉴 `시나리오`(→ `#/`) · `도구 소개`(→ `#/tools`), 오른쪽 `닉네임 님`(→ `#/me`). 로그아웃 버튼은 마이페이지에만 있다.

---

## 1.4 API 호출 공통 처리 (api.ts)

화면은 서버를 부를 때 항상 `api(path, options)`를 쓴다.

```mermaid
sequenceDiagram
    autonumber
    participant PG as 화면 컴포넌트
    participant A as api.ts api()
    participant LS as localStorage
    participant S as 서버 /api

    PG->>A: api(path, {method, body})
    A->>LS: getToken()
    opt 토큰 있음
        A->>A: 헤더 Authorization: Bearer 토큰
    end
    opt body가 문자열 (JSON.stringify 결과)
        A->>A: 헤더 Content-Type: application/json
    end
    Note over A: FormData(파일 업로드), URLSearchParams(로그인 폼)는<br/>브라우저가 Content-Type을 정한다
    A->>S: fetch("/api" + path)
    S-->>A: 응답
    opt 401 이고 path가 /auth로 시작하지 않음
        A->>LS: 토큰 삭제
        A->>A: location.hash를 /login으로 바꿈 → 로그인 화면
    end
    alt 2xx
        A-->>PG: 응답 JSON
    else 그 밖 (4xx, 5xx)
        A->>A: 오류 문장 만들기 (아래 표)
        A-->>PG: throw ApiError(status, 문장)
        PG->>PG: 대부분 화면 위 빨간 글씨로 표시
    end
```

| 서버 응답 본문                                                            | 화면에 보이는 문장                                              | 예                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `{"detail": "문장"}` — 코드에서 직접 낸 오류 (400·401·404·409·502) | 그 문장 그대로                                                  | `PDF 파일이 아닙니다.`                                            |
| `{"detail": [{"msg": ...}, ...]}` — 입력 형식 오류 (422)               | 각 `msg`에서 앞의 `Value error, `를 떼고 `, `로 이어 붙임 | `비밀번호에 영문 대문자·숫자·특수문자를 하나 이상 넣어 주세요.` |
| JSON이 아님 — 처리하지 못한 예외의 500 (`Internal Server Error`)       | `요청 실패 (500)`                                             | Bedrock 오류로 계획 만들기 실패 ([04 문서](04-plan-draft.md))        |

로그인 실패(`/auth/login`의 401)는 경로가 `/auth`로 시작하므로 로그인 화면 이동 처리를 하지 않고 문장만 보여 준다.

---

## 1.5 서버가 요청 1건을 처리하는 순서

FastAPI가 요청마다 하는 일이다. 로그인이 필요한 API는 모두 이 순서를 탄다.

```mermaid
sequenceDiagram
    autonumber
    participant C as 클라이언트
    participant FA as FastAPI
    participant GD as db.py get_db()
    participant CU as auth.py current_user()
    participant H as 엔드포인트 함수
    participant DB as DB

    C->>FA: HTTP 요청
    FA->>FA: 경로 찾기 (없으면 404, 메서드가 다르면 405)
    FA->>GD: 세션 1개 열기 (같은 요청 안에서는 이 세션을 같이 쓴다)
    opt 로그인이 필요한 API
        FA->>CU: Bearer 토큰 확인 (02 문서)
        CU->>DB: 토큰 속 사용자 id로 users 조회
        break 토큰 없음, 무효, 만료, 사용자 없음
            CU-->>C: 401
        end
        CU-->>FA: User
    end
    FA->>FA: 경로 숫자·본문 형식 검사 (pydantic)
    break 형식 오류
        FA-->>C: 422 {"detail": [오류 목록]}
    end
    FA->>H: handler(검사된 값, user, db)
    H->>DB: 조회·저장 (저장은 함수 안에서 db.commit())
    alt HTTPException
        H-->>FA: 400, 404, 409, 502 등 + detail 문장
    else 처리하지 못한 예외
        H-->>FA: 500 Internal Server Error (본문이 JSON이 아님)
    else 정상
        H-->>FA: 반환값
        FA->>FA: response_model 형식으로 정리 (예: password_hash는 빠짐)
    end
    FA->>GD: 세션 닫기
    FA-->>C: 응답
```

- 인증 오류(401)가 형식 오류(422)보다 먼저 난다. 예를 들어 토큰 없이 잘못된 폼이나 범위 밖 ID를 보내도 401이다. 예외는 JSON 문법 자체가 깨진 본문으로, 본문을 읽는 단계에서 바로 422(`json_invalid`)가 난다.
- 경로의 ID(`/scenarios/{id}`, `/runs/{id}`)는 1 이상 `2^63-1` 이하만 받는다. `0`, `-1`, 너무 큰 수, 숫자가 아닌 값은 DB에 묻기 전에 422다.
- 시나리오·실행 API는 인증 다음에 "내 시나리오인지"(`_own`)를 확인한다. 남의 것은 있어도 404 `시나리오를 찾을 수 없습니다.`로 답한다.

---

## 1.6 `/api/health`

로그인 없이 부를 수 있는 상태 확인용 API다.

```json
// GET /api/health → 200
{"ok": true, "llm": "fake", "guardrail": false}
```

`llm`은 `LLM_MODE` 값, `guardrail`은 `GUARDRAIL_ID`가 설정됐는지다 (Guardrails 검사 자체는 지금 아무도 부르지 않는다).

---

## 1.7 환경 설정이 동작에 미치는 영향

| 설정                                    | 기본값                                                                       | 영향                                                                                                              | 관련 문서                             |
| --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `JWT_SECRET_KEY`                      | 없음                                                                         | 비어 있으면 앱이 뜨지 않는다. 토큰 서명 키라 바꾸면 기존 토큰이 모두 무효                                         | [02](02-auth.md)                       |
| `JWT_ALGORITHM`                       | `HS256`                                                                    | 토큰 서명 방식                                                                                                    | [02](02-auth.md)                       |
| `ACCESS_TOKEN_EXPIRE_MINUTES`         | `60`                                                                       | 로그인 유지 시간. 지나면 다음 API 호출에서 401 → 로그인 화면                                                     | [02](02-auth.md)                       |
| `DATABASE_URL`                        | `mariadb+pymysql://app:app_password@localhost:3306/app_db?charset=utf8mb4` | 저장소                                                                                                            | -                                     |
| `WEB_DIST`                            | `web/dist`                                                                 | 폴더가 있으면 FastAPI가 화면도 내준다                                                                             | 1.2                                   |
| `LLM_MODE`                            | `fake`                                                                     | `fake`: 정해진 규칙대로 답하는 가짜 LLM / `bedrock`: Amazon Bedrock 호출                                      | [04](04-plan-draft.md), [06](06-run.md) |
| `BEDROCK_MODEL_ID`                    | 없음                                                                         | `bedrock` 모드에서 비어 있으면 계획 만들기는 500, 실행은 FAILED Run                                             | [04](04-plan-draft.md), [06](06-run.md) |
| `AWS_REGION`                          | `ap-northeast-2`                                                           | Bedrock 리전                                                                                                      | [06](06-run.md)                        |
| `PLANNER_TOOL_CHOICE`                 | `tool`                                                                     | `tool`: `submit_plan` 도구를 콕 집어 강제 / `any`: 아무 도구나 강제 (특정 도구 강제를 지원하지 않는 모델용) | [04](04-plan-draft.md)                 |
| `GUARDRAIL_ID`, `GUARDRAIL_VERSION` | 없음, `1`                                                                  | `/api/health`의 `guardrail` 값에만 쓰인다                                                                     | -                                     |
| `MAX_TURNS` (고정)                    | 8                                                                            | 실행 1번에 LLM과 주고받는 최대 횟수                                                                               | [06](06-run.md)                        |
| `MAX_TOOL_CALLS` (고정)               | 8                                                                            | 실행 1번의 최대 도구 호출 수                                                                                      | [06](06-run.md)                        |
| `MAX_TOKENS` (고정)                   | 2048                                                                         | LLM 응답 최대 토큰 (계획·실행 공통)                                                                              | [04](04-plan-draft.md), [06](06-run.md) |
| `MAX_PDF_BYTES` (고정)                | 10MB                                                                         | PDF 크기 제한                                                                                                     | [03](03-scenario-create.md)            |
| `MAX_TASK_CHARS` (고정)               | 2000                                                                         | 요청 문장 길이 제한                                                                                               | [03](03-scenario-create.md)            |

---

## ⚠️ 알아둘 점

1. `Shell`은 토큰이 **있는지만** 본다. 만료되거나 위조된 토큰이어도 화면 틀은 먼저 그려지고, 첫 API 호출이 401을 받는 순간 로그인 화면으로 간다.
2. LLM 클라이언트는 프로세스당 하나를 만들어 재사용한다(`lru_cache`). `LLM_MODE`를 바꾸면 서버를 다시 띄워야 한다. 단, Bedrock 클라이언트 생성이 실패하면(예: `BEDROCK_MODEL_ID` 없음) 캐시되지 않아 요청마다 다시 만들려고 시도한다.
3. `web/dist`가 남아 있으면 8000번 주소에서는 예전에 빌드한 화면이 보인다. 개발 중에는 5173번으로 본다.
4. 로그인 없이 열리는 API는 `/api/health`, `/api/auth/signup`, `/api/auth/login`, `/api/tools`, 그리고 FastAPI 기본 문서(`/docs`, `/openapi.json`)다.
