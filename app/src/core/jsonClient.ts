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

export type DeviceMode = 'wifi' | 'uvc' | 'auto' | 'unknown';

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

export function extractDeviceMode(resp: any): DeviceMode {
  const payload = extractNestedPayload(resp) as any;
  const mode = (payload && typeof payload === 'object' && (payload as any).mode) ? String((payload as any).mode).toLowerCase() : 'unknown';
  if (mode === 'wifi' || mode === 'uvc' || mode === 'auto') return mode;
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
  params: { mode: 'wifi' | 'uvc' | 'auto' },
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
