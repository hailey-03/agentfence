import { useEffect } from "react";

/** 저장하지 않은 편집이 있을 때 페이지를 떠나기 전에 한 번 묻는다.
 * HashRouter는 useBlocker를 지원하지 않아, 앱 안 링크(<a href="#/...">) 클릭과
 * 새로고침·탭 닫기를 직접 가로챈다. 브라우저 뒤로 가기는 막지 못한다. */
export function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a");
      if (!a || !a.getAttribute("href")?.startsWith("#/")) return;
      if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    document.addEventListener("click", onClick, true);   // 캡처 단계: 라우터보다 먼저 받는다
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active, message]);
}
