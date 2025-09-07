import type { Transport } from "ffvr-esptool/index.js";
import { sendJsonCommand } from "./protocol";
import { dbg } from "../ui/debug";

// Shared types for JSON-command based features
export type JsonCommand = string;
export type JsonParams = any;
export type JsonResponse = any;

export type WifiNetwork = {
  ssid: string;
  rssi: number;
  channel: number;
  auth_mode: number;
  mac_address?: string;
};

export type WifiStatus = {
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'unknown';
  ip_address?: string;
  message?: string;
};

export type DeviceMode = 'wifi' | 'uvc' | 'setup' | 'unknown';
export type SerialInfo = { serial?: string | null; mac?: string | null };
export type WhoAmIInfo = { who_am_i?: string | null; version?: string | null };

export type LedDuty = number | null; // percentage 0-100
export type LedCurrent = number | null; // mA

// Single entry-point to send a JSON command over the current transport
export async function sendCommand(
  transport: Transport,
  command: JsonCommand,
  params?: JsonParams,
  timeoutMs = 15000
): Promise<JsonResponse> {
  return sendJsonCommand(transport, command, params, timeoutMs);
}

// Helper to normalize/extract WiFi scan results from various firmware payload shapes
export function extractNetworks(resp: any): WifiNetwork[] {
  if (resp && Array.isArray(resp.networks)) {
    return resp.networks as WifiNetwork[];
  }
  const resArr = resp?.results || [];
  for (const entry of resArr) {
    try {
      const obj = typeof entry === 'string' ? JSON.parse(entry) : entry;
      let payload: any = obj;
      if (payload && typeof payload.result !== 'undefined') {
        payload = payload.result;
      }
      if (typeof payload === 'string') {
        if (payload.indexOf('"networks"') !== -1) {
          const parsed = JSON.parse(payload);
          if (Array.isArray(parsed.networks)) return parsed.networks as WifiNetwork[];
        }
      } else if (payload && Array.isArray(payload.networks)) {
        return payload.networks as WifiNetwork[];
      }
    } catch {}
  }
  return [];
}

// Normalize WiFi status payloads coming back from the device into a simple shape
export function extractWifiStatus(resp: any): WifiStatus {
  const status: WifiStatus = { status: 'unknown' };
  try {
    let payload: any = resp;
    if (payload && Array.isArray(payload.results) && payload.results.length) {
      let inner: any = payload.results[0];
      if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch {}
      }
      if (inner && typeof inner.result !== 'undefined') {
        payload = inner.result;
      }
    }
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {}
    }
    if (payload && typeof payload === 'object') {
      const s = (payload as any).status as string | undefined;
      const ip = (payload as any).ip_address as string | undefined;
      if (s === 'error') {
        status.status = 'error';
        status.message = (payload as any).message || 'error';
      } else if (ip && ip !== '0.0.0.0') {
        status.status = 'connected';
        status.ip_address = ip;
      } else if (s === 'connecting') {
        status.status = 'connecting';
      } else if (s === 'disconnected') {
        status.status = 'disconnected';
      }
    }
  } catch {}
  return status;
}

// Helper to extract nested payload commonly returned as results[0].result (possibly JSON string)
function extractNestedPayload(resp: any): any | null {
  try {
    let payload: any = resp;
    if (payload && Array.isArray(payload.results) && payload.results.length) {
      let inner: any = payload.results[0];
      if (typeof inner === 'string') { try { inner = JSON.parse(inner); } catch {} }
      if (inner && typeof inner.result !== 'undefined') {
        payload = inner.result;
      } else {
        payload = inner;
      }
    }
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
    return payload ?? null;
  } catch { return null; }
}

export function extractLedDuty(resp: any): LedDuty {
  const p = extractNestedPayload(resp) as any;
  if (p && typeof p === 'object') {
    if (typeof (p as any).led_external_pwm_duty_cycle === 'number') return (p as any).led_external_pwm_duty_cycle;
    if (typeof (p as any).duty === 'number') return (p as any).duty;
  }
  return null;
}

export function extractLedCurrent(resp: any): LedCurrent {
  const p = extractNestedPayload(resp) as any;
  if (p && typeof p === 'object') {
    if (typeof (p as any).led_current_ma === 'number') return (p as any).led_current_ma;
    if (typeof (p as any).current === 'number') return (p as any).current;
  }
  return null;
}

export function extractSerialInfo(resp: any): SerialInfo {
  const p = extractNestedPayload(resp) as any;
  const out: SerialInfo = {};
  if (p && typeof p === 'object') {
    if (typeof (p as any).serial === 'string') out.serial = (p as any).serial;
    if (typeof (p as any).mac === 'string') out.mac = (p as any).mac;
  }
  return out;
}

export function extractWhoAmI(resp: any): WhoAmIInfo {
  const p = extractNestedPayload(resp) as any;
  const out: WhoAmIInfo = {};
  if (p && typeof p === 'object') {
    if (typeof (p as any).who_am_i === 'string') out.who_am_i = (p as any).who_am_i;
    if (typeof (p as any).version === 'string') out.version = (p as any).version;
  }
  return out;
}

export function extractDeviceMode(resp: any): DeviceMode {
  const payload = extractNestedPayload(resp) as any;
  const mode = (payload && typeof payload === 'object' && (payload as any).mode) ? String((payload as any).mode).toLowerCase() : 'unknown';
  if (mode === 'wifi' || mode === 'uvc' || mode === 'setup') return mode as DeviceMode;
  return 'unknown';
}

export function extractMdnsName(resp: any): string | null {
  const payload = extractNestedPayload(resp) as any;
  if (payload && typeof payload === 'object' && typeof (payload as any).hostname === 'string') {
    return (payload as any).hostname as string;
  }
  return null;
}

// Convenience: send known commands and return normalized results where helpful
export async function sendAndExtract(
  transport: Transport,
  command: 'scan_networks',
  params?: undefined,
  timeoutMs?: number
): Promise<WifiNetwork[]>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_wifi_status',
  params?: undefined,
  timeoutMs?: number
): Promise<WifiStatus>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_device_mode',
  params?: undefined,
  timeoutMs?: number
): Promise<DeviceMode>;
export async function sendAndExtract(
  transport: Transport,
  command: 'switch_mode',
  params: { mode: 'wifi' | 'uvc' | 'setup' },
  timeoutMs?: number
): Promise<boolean>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_mdns_name',
  params?: undefined,
  timeoutMs?: number
): Promise<string | null>;
export async function sendAndExtract(
  transport: Transport,
  command: 'set_mdns',
  params: { hostname: string },
  timeoutMs?: number
): Promise<boolean>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_led_duty_cycle',
  params?: undefined,
  timeoutMs?: number
): Promise<LedDuty>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_led_current',
  params?: undefined,
  timeoutMs?: number
): Promise<LedCurrent>;
export async function sendAndExtract(
  transport: Transport,
  command: 'set_led_duty_cycle',
  params: { dutyCycle: number },
  timeoutMs?: number
): Promise<boolean>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_serial',
  params?: undefined,
  timeoutMs?: number
): Promise<SerialInfo>;
export async function sendAndExtract(
  transport: Transport,
  command: 'get_who_am_i',
  params?: undefined,
  timeoutMs?: number
): Promise<WhoAmIInfo>;
export async function sendAndExtract(
  transport: Transport,
  command: 'start_streaming',
  params?: undefined,
  timeoutMs?: number
): Promise<boolean>;
export async function sendAndExtract(
  transport: Transport,
  command: 'pause',
  params: { pause: boolean },
  timeoutMs?: number
): Promise<boolean>;
export async function sendAndExtract(
  transport: Transport,
  command: JsonCommand,
  params?: JsonParams,
  timeoutMs = 15000
): Promise<any> {
  if (command === 'scan_networks') {
    const attempts = 3;
    const delayMs = 400;
    for (let i = 1; i <= attempts; i++) {
      const resp = await sendCommand(transport, 'scan_networks', undefined, timeoutMs);
      const nets = extractNetworks(resp) || [];
      try { dbg(`scan_networks attempt ${i}/${attempts}: ${nets.length} networks`, 'info'); } catch {}
      if (Array.isArray(nets) && nets.length > 0) return nets;
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
    }
    return [];
  }
  const resp = await sendCommand(transport, command, params, timeoutMs);
  if (command === 'get_device_mode') return extractDeviceMode(resp);
  if (command === 'switch_mode') return !resp?.error;
  if (command === 'get_mdns_name') return extractMdnsName(resp);
  if (command === 'set_mdns') return !resp?.error;
  if (command === 'get_led_duty_cycle') return extractLedDuty(resp);
  if (command === 'get_led_current') return extractLedCurrent(resp);
  if (command === 'set_led_duty_cycle') return !resp?.error;
  if (command === 'get_serial') return extractSerialInfo(resp);
  if (command === 'get_who_am_i') return extractWhoAmI(resp);
  if (command === 'start_streaming') return !resp?.error;
  if (command === 'pause') return !resp?.error;
  
  if (command === 'get_wifi_status') return extractWifiStatus(resp);
  return resp;
}

// Template for future commands (example):
//
// export type FooInfo = { foo: string; bar: number };
// export function extractFoo(resp: any): FooInfo | null {
//   // Normalize/parse resp here; return null if not found
//   return null;
// }
// declare module './jsonClient' { }
// export async function sendAndExtract(
//   transport: Transport,
//   command: 'get_foo_info',
//   params?: {},
//   timeoutMs?: number
// ): Promise<FooInfo | null>;
// // And extend the implementation switch:
// // if (command === 'get_foo_info') return extractFoo(resp);
