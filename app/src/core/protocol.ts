import type { Transport } from "ffvr-esptool/index.js";
import { dbg } from "../ui/debug";

export async function sendJsonCommand(transport: Transport, command: string, params?: any, timeoutMs = 15000): Promise<any> {
  if (!transport) throw new Error("Not connected");
  const cmdObj: any = { commands: [{ command }] };
  if (params !== undefined) cmdObj.commands[0].data = params;
  const payload = JSON.stringify(cmdObj) + "\n";
  try { dbg(`Sending: ${payload.trim()}`, 'info'); } catch {}

  const enc = new TextEncoder();
  const data = enc.encode(payload);
  // @ts-ignore
  const dev: any = (transport as any)?.device;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    // @ts-ignore
    writer = dev?.writable?.getWriter ? dev.writable.getWriter() : null;
    if (!writer) throw new Error("Writer not available");
    await writer.write(data);
  } finally {
    try { writer?.releaseLock?.(); } catch {}
  }

  const dec = new TextDecoder();
  let buffer = "";
  const start = Date.now();
  // For WiFi scans, prefer a non-empty result; if the first result is empty,
  // allow a grace period to collect a later, populated result before returning.
  let emptyScanSeenAt: number | null = null;
  let lastEmptyNetworks: any[] | null = null;
  // Derive a reasonable grace window from timeout (max 5s, min 1.5s)
  const scanGraceMs = Math.max(1500, Math.min(5000, Math.floor(timeoutMs / 8)));
  while (Date.now() - start < timeoutMs) {
    const loop = (transport as any).rawRead();
    const { value, done } = await loop.next();
    if (done) break;
    if (!value) continue;
    let chunk = dec.decode(value, { stream: true });
    chunk = chunk.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "\n");
    buffer += chunk;

    // If we previously saw an empty scan, and no further data arrived within a short grace period, return it.
  if (command === 'scan_networks' && emptyScanSeenAt && Date.now() - emptyScanSeenAt > scanGraceMs) {
      return { networks: lastEmptyNetworks || [] };
    }

    let sIdx = buffer.indexOf('{');
    while (sIdx !== -1) {
      let brace = 0;
      let eIdx = -1;
      for (let i = sIdx; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === '{') brace++;
        else if (ch === '}') {
          brace--;
          if (brace === 0) { eIdx = i + 1; break; }
        }
      }
      if (eIdx > sIdx) {
        const jsonStr = buffer.slice(sIdx, eIdx).trim();
        buffer = buffer.slice(eIdx);
        try {
          const obj = JSON.parse(jsonStr);
          if (command === 'scan_networks') {
            const findNetworks = (o: any): any[] | null => {
              if (!o) return null;
              if (Array.isArray(o.networks)) return o.networks;
              if ((o as any).result !== undefined) {
                let p: any = (o as any).result;
                if (typeof p === 'string') { try { p = JSON.parse(p); } catch {} }
                const nn = findNetworks(p); if (nn) return nn;
              }
              if (Array.isArray((o as any).results)) {
                for (let e of (o as any).results) {
                  if (typeof e === 'string') { try { e = JSON.parse(e); } catch {} }
                  const nn = findNetworks(e); if (nn) return nn;
                }
              }
              return null;
            };
            const nets = findNetworks(obj);
            if (nets) {
              if (nets.length > 0) {
                return { networks: nets };
              }
              // First hit but empty: remember and wait briefly for a better result
              if (!emptyScanSeenAt) {
                emptyScanSeenAt = Date.now();
                lastEmptyNetworks = nets;
                try { dbg(`Scan empty result observed; waiting up to ${scanGraceMs}ms for populated list...`, 'info'); } catch {}
              }
              // Continue reading without returning yet
            }
          }
          if (obj && (Object.prototype.hasOwnProperty.call(obj, 'results') || Object.prototype.hasOwnProperty.call(obj, 'error'))) {
            if (command !== 'scan_networks') {
              try { dbg(`Received: ${JSON.stringify(obj)}`, 'info'); } catch {}
              return obj;
            }
          }
        } catch {}
        sIdx = buffer.indexOf('{');
        continue;
      } else {
        break;
      }
    }
  }
  if (command === 'scan_networks' && lastEmptyNetworks) {
    return { networks: lastEmptyNetworks };
  }
  return { error: "Command timeout" };
}
