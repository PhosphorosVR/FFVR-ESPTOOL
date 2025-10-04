import { el } from "./dom";

let connectAlertTimer: any = null;

export function updateConnStatusDot(up: boolean) {
  const dot = el.connStatusDot();
  if (!dot) return;
  try {
    dot.classList.toggle('status-green', !!up);
    dot.classList.toggle('status-red', !up);
    dot.title = up ? 'Connected' : 'Disconnected';
    dot.setAttribute('aria-label', up ? 'Connected' : 'Disconnected');
  } catch {}
}

export function showConnectAlert(msg: string, kind: 'success' | 'error' = 'error') {
  const alertEl = el.connectAlert();
  const msgEl = el.connectAlertMsg();
  if (!alertEl || !msgEl) return;
  try {
    // Style
    alertEl.classList.remove('success');
    if (kind === 'success') alertEl.classList.add('success');
    msgEl.textContent = msg || '';
    alertEl.style.display = 'block';
    // Auto hide after 5s
    if (connectAlertTimer) { try { clearTimeout(connectAlertTimer); } catch {} connectAlertTimer = null; }
  connectAlertTimer = setTimeout(() => {
      try { alertEl.style.display = 'none'; } catch {}
  }, 8000);
  } catch {}
}

export function showConnectSuccess(msg: string) { showConnectAlert(msg, 'success'); }

export function hideConnectAlert() {
  const alertEl = el.connectAlert();
  try {
    if (connectAlertTimer) { clearTimeout(connectAlertTimer); connectAlertTimer = null; }
    if (alertEl) alertEl.style.display = 'none';
  } catch {}
}
