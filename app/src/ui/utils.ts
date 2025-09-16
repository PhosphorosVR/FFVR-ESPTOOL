export function escapeHtml(s: any): string {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function startStatusAnimation(statusEl: HTMLElement | null, baseText: string) {
  if (!statusEl) return () => {};
  let dots = 0;
  const maxDots = 5;
  statusEl.textContent = baseText;
  const timer = setInterval(() => {
    dots = (dots + 1) % (maxDots + 1);
    try { statusEl.textContent = baseText + '.'.repeat(dots); } catch {}
  }, 300);
  return () => { try { clearInterval(timer); } catch {} };
}

// Global busy indicator (top-right subtle badge with spinner)
let busyCount = 0;
let lastText = 'Working…';
let lastShowAt = 0;
let hideTimer: any = null;

function ensureBusyElement(): { root: HTMLElement; textEl: HTMLElement } | null {
  try {
    let root = document.getElementById('globalBusy') as HTMLElement | null;
    if (!root) return null;
    const textEl = document.getElementById('globalBusyText') as HTMLElement | null;
    if (!textEl) return null;
    return { root, textEl };
  } catch { return null; }
}

export function showBusy(text?: string) {
  busyCount = Math.max(0, busyCount) + 1;
  if (text) lastText = text;
  const el = ensureBusyElement();
  if (!el) return;
  // Cancel any pending hide if new show arrives
  if (hideTimer) { try { clearTimeout(hideTimer); } catch {} hideTimer = null; }
  el.textEl.textContent = lastText;
  el.root.style.display = 'flex';
  lastShowAt = Date.now();
}

export function hideBusy() {
  busyCount = Math.max(0, busyCount - 1);
  const el = ensureBusyElement();
  if (!el) return;
  if (busyCount === 0) {
    const elapsed = Date.now() - (lastShowAt || 0);
    const minMs = 350; // avoid flicker on very fast ops
    if (elapsed >= minMs) {
      el.root.style.display = 'none';
    } else {
      // Delay hiding just enough to meet minimum display time
      const delay = Math.max(0, minMs - elapsed);
      if (hideTimer) { try { clearTimeout(hideTimer); } catch {} }
      hideTimer = setTimeout(() => {
        try { el.root.style.display = 'none'; } catch {}
        hideTimer = null;
      }, delay);
    }
  }
}

// Per-panel busy overlays (centered in container)
type PanelBusyState = { count: number; el: HTMLElement };
const panelBusyKey = '__panelBusyState__';

function ensurePanelOverlay(container: HTMLElement): PanelBusyState {
  // @ts-ignore
  let st: PanelBusyState | undefined = container[panelBusyKey];
  if (st && st.el && document.body.contains(st.el)) return st;
  const overlay = document.createElement('div');
  overlay.className = 'panel-busy-overlay';
  overlay.innerHTML = `
    <div class="panel-busy-content">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="spin">
        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
        <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--accent)" stroke-width="3"/>
      </svg>
      <span class="txt">Working…</span>
    </div>`;
  // Ensure container positioning for absolute overlay
  const prevPos = getComputedStyle(container).position;
  if (!prevPos || prevPos === 'static') {
    container.classList.add('has-panel-busy');
  }
  container.appendChild(overlay);
  // @ts-ignore
  st = container[panelBusyKey] = { count: 0, el: overlay } as PanelBusyState;
  return st;
}

export function showPanelBusy(container: HTMLElement | null, text?: string) {
  if (!container) return;
  const st = ensurePanelOverlay(container);
  st.count = Math.max(0, st.count) + 1;
  const txtEl = st.el.querySelector('.txt') as HTMLElement | null;
  if (txtEl && text) txtEl.textContent = text;
  st.el.style.display = 'flex';
}

export function hidePanelBusy(container: HTMLElement | null) {
  if (!container) return;
  // @ts-ignore
  const st: PanelBusyState | undefined = container[panelBusyKey];
  if (!st) return;
  st.count = Math.max(0, st.count - 1);
  if (st.count === 0) {
    st.el.style.display = 'none';
  }
}
