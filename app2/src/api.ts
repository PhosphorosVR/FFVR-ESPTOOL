import { OpenPort, writeJson, readJsonResponse } from './serial';

export async function sendCommand(op: OpenPort, command: string, data?: any, timeoutMs = 15000): Promise<any> {
  await writeJson(op, command, data);
  const special = command === 'scan_networks';
  return readJsonResponse(op, special ? Math.max(timeoutMs, 30000) : timeoutMs, special);
}

function extractNested(resp: any): any {
  try {
    if (resp && Array.isArray(resp.results) && resp.results.length) {
      let inner: any = resp.results[0];
      if (typeof inner === 'string') inner = JSON.parse(inner);
      if (inner && typeof inner.result !== 'undefined') {
        let p: any = inner.result;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch {} }
        return p;
      }
      return inner;
    }
  } catch {}
  return resp;
}

export function parseNetworks(resp: any): any[] {
  const p = extractNested(resp);
  if (p && Array.isArray((p as any).networks)) return (p as any).networks;
  return [];
}

export function parseWifiStatus(resp: any): { status: string; ip?: string; networks_configured?: number } {
  const p = extractNested(resp) || {};
  return {
    status: p.status || 'unknown',
    ip: p.ip_address,
    networks_configured: p.networks_configured
  };
}

export function parseDeviceMode(resp: any): string {
  const p = extractNested(resp) || {};
  const mode = p.mode || 'unknown';
  return String(mode).toLowerCase();
}

export function parseMdnsName(resp: any): string {
  const p = extractNested(resp) || {};
  return p.hostname || 'unknown';
}

export function parseLedDuty(resp: any): number | null {
  const p = extractNested(resp) || {};
  if (typeof p.led_external_pwm_duty_cycle === 'number') return p.led_external_pwm_duty_cycle;
  return null;
}

export function parseLedCurrent(resp: any): number | null {
  const p = extractNested(resp) || {};
  if (typeof p.led_current_ma === 'number') return p.led_current_ma;
  return null;
}

export function parseSerialInfo(resp: any): { serial?: string; mac?: string } {
  const p = extractNested(resp) || {};
  return { serial: p.serial, mac: p.mac };
}
