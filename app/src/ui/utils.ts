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

// Global (floating) busy pill in top-right (index.html provides #globalBusy / #globalBusyText)
export function showBusy(label: string = 'Working…') {
  try {
    const box = document.getElementById('globalBusy');
    const txt = document.getElementById('globalBusyText');
    if (box) box.style.display = 'inline-flex';
    if (txt) txt.textContent = label;
  } catch {}
}

export function hideBusy() {
  try {
    const box = document.getElementById('globalBusy');
    if (box) box.style.display = 'none';
  } catch {}
}

// Per-panel busy overlay (non-blocking, small inline spinner + label top-right inside panel)
// Adds a positioned badge within the panel (expects panel relatively positioned via helper class)
export function showPanelBusy(panel: HTMLElement, label: string = 'Working…') {
  if (!panel) return;
  try {
    panel.classList.add('has-panel-busy');
    let holder = panel.querySelector(':scope > .panel-busy-indicator') as HTMLElement | null;
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'panel-busy-indicator';
      holder.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="spin">
          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
          <path d="M22 12a10 10 0 0 0-10-10" stroke="var(--accent)" stroke-width="3"/>
        </svg>
        <span class="t"></span>`;
      panel.appendChild(holder);
    }
    const t = holder.querySelector('.t');
    if (t) t.textContent = label;
  } catch {}
}

export function hidePanelBusy(panel: HTMLElement) {
  if (!panel) return;
  try {
    const holder = panel.querySelector(':scope > .panel-busy-indicator') as HTMLElement | null;
    if (holder) holder.remove();
    panel.classList.remove('has-panel-busy');
  } catch {}
}

