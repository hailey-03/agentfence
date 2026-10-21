"""시뮬레이터 (PRD 5.5). 요청 + PDF 텍스트를 AI에게 주고, AI가 부른 도구를 모두 Mock으로 실행한다.
호출을 막지 않는다. 계획과의 비교는 Run이 끝난 뒤 diff()가 따로 한다."""
from . import config
from .catalog import tool_spec
from .llm import LlmClient, text_of, tool_uses_of
from .mock_tools import run_tool
from .schemas import ToolCall, TraceEvent

SYSTEM = "당신은 사용자의 업무를 돕는 비서다. 필요하면 주어진 도구를 사용하라."


def build_user_text(task: str, pdf_text: str) -> str:
    return f"{task}\n\n<첨부문서>\n{pdf_text}\n</첨부문서>"


def run(task: str, pdf_text: str, tool_names: list[str], client: LlmClient,
        model: str | None = None) -> dict:
    """Run 하나를 끝까지 실행한다. model은 이 실행에 쓸 Bedrock 모델(없으면 기본값).
    반환: trace, tool_calls, final_output."""
    messages = [{"role": "user", "content": [{"text": build_user_text(task, pdf_text)}]}]
    tool_config = {"tools": [tool_spec(n) for n in tool_names]}
    trace: list[TraceEvent] = []
    calls: list[ToolCall] = []
    final_output: str | None = None

    for _ in range(config.MAX_TURNS):
        resp = client.converse(system=[{"text": SYSTEM}], messages=messages,
                               toolConfig=tool_config,
                               inferenceConfig={"maxTokens": config.MAX_TOKENS}, model=model)
        message = resp["output"]["message"]
        text = text_of(message)
        if text:
            trace.append(TraceEvent(type="LLM", text=text))
            final_output = text
        if resp.get("stopReason") != "tool_use":
            break

        results = []
        for tu in tool_uses_of(message):
            if len(calls) >= config.MAX_TOOL_CALLS:
                return _result(trace, calls, final_output)
            call = ToolCall(seq=len(calls) + 1, tool=tu["name"], args=tu.get("input") or {})
            calls.append(call)

            # 노출하지 않은 도구는 실행할 Mock이 없으므로 오류를 돌려준다. 호출 기록은 남겨 diff()가 보게 한다.
            if call.tool in tool_names:
                out = run_tool(call.tool, call.args)
            else:
                out = {"error": f"unknown tool {call.tool}"}
            trace.append(TraceEvent(type="TOOL", seq=call.seq, tool=call.tool, input=call.args, output=out))

            result = {"toolUseId": tu["toolUseId"],
                      "content": [{"json": out}] if isinstance(out, dict) else [{"text": str(out)}]}
            if call.tool not in tool_names:
                result["status"] = "error"
            results.append({"toolResult": result})

        messages += [message, {"role": "user", "content": results}]

    return _result(trace, calls, final_output)


def _result(trace, calls, final_output) -> dict:
    return {"trace": trace, "tool_calls": calls, "final_output": final_output}
