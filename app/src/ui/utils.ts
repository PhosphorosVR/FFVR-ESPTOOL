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
