/**
 * 소스 분석 억제 장치 — 프로덕션/스테이징에서만 동작 (로컬 개발 제외).
 * 우클릭·소스보기/개발자도구 단축키·드래그 저장을 막는다.
 * 완전한 차단은 기술적으로 불가능하며(브라우저는 항상 코드를 받아야 함),
 * 난독화(vite.config.ts)와 함께 "가볍게 못 보게" 하는 억제 수단이다.
 */
export function installProtection() {
  if (!import.meta.env.PROD) return
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return

  // 우클릭 메뉴 (소스보기/이미지 저장/검사 진입점) 차단
  document.addEventListener('contextmenu', (e) => e.preventDefault())

  // 이미지 드래그 저장 차단
  document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement) e.preventDefault()
  })

  // 개발자도구·소스보기 단축키 차단
  // F12 · Ctrl/Cmd+Shift+I/J/C (검사·콘솔) · Ctrl/Cmd+U (소스보기) · Ctrl/Cmd+S (저장)
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (
      e.key === 'F12' ||
      (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
      (mod && (k === 'u' || k === 's'))
    ) {
      e.preventDefault()
      e.stopPropagation()
    }
  })
}
