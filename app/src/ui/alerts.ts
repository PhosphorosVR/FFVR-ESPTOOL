import { el } from "./dom";

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

export function showConnectAlert(msg: string) {
  const alertEl = el.connectAlert();
  const msgEl = el.connectAlertMsg();
  try {
    if (msgEl) msgEl.textContent = msg || '';
    if (alertEl) alertEl.style.display = 'block';
  } catch {}
}

export function hideConnectAlert() {
  const alertEl = el.connectAlert();
  try { if (alertEl) alertEl.style.display = 'none'; } catch {}
}
