// Simple Web Serial wrapper for OpenIris style JSON command/response
export interface OpenPort {
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  isOpen: boolean;
  buffer: string;
}

export async function requestPort(): Promise<SerialPort> {
  return await (navigator as any).serial.requestPort({});
}

export async function openPort(port: SerialPort, baud: number): Promise<OpenPort> {
  await port.open({ baudRate: baud });
  return { port, reader: null, isOpen: true, buffer: "" };
}

export async function closePort(op: OpenPort | null) {
  if (!op) return;
  try { if (op.reader) await op.reader.cancel(); } catch {}
  try { await op.port.close(); } catch {}
  op.isOpen = false;
}

export async function writeJson(op: OpenPort, command: string, data?: any): Promise<void> {
  const encoder = new TextEncoder();
  const payload: any = { commands: [{ command }] };
  if (data !== undefined) payload.commands[0].data = data;
  const line = JSON.stringify(payload) + '\n';
  const writer = op.port.writable?.getWriter();
  if (!writer) throw new Error('Writer not available');
  try {
    await writer.write(encoder.encode(line));
  } finally { try { writer.releaseLock(); } catch {} }
}

// Reads until a complete JSON object with results or error is parsed OR timeout
export async function readJsonResponse(op: OpenPort, timeoutMs: number, specialScan = false): Promise<any> {
  const decoder = new TextDecoder();
  const start = Date.now();
  if (!op.reader) op.reader = op.port.readable?.getReader() || null;
  if (!op.reader) throw new Error('No reader');
  let networksJson: any | null = null;
  while (Date.now() - start < timeoutMs) {
    const { value, done } = await op.reader.read();
    if (done) break;
    if (value) {
      op.buffer += decoder.decode(value, { stream: true }).replace(/\x1b\[[0-9;]*m/g, '');
      // scan special direct networks JSON
      if (specialScan && op.buffer.includes('{"networks":[') && !networksJson) {
        const m = op.buffer.match(/\{"networks":\[.*?\]\}/s);
        if (m) {
          try { networksJson = JSON.parse(m[0]); } catch {}
        }
      }
      // parse objects
      let idx = op.buffer.indexOf('{');
      while (idx !== -1) {
        let depth = 0; let end = -1;
        for (let i = idx; i < op.buffer.length; i++) {
          const ch = op.buffer[i];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end > idx) {
          const objStr = op.buffer.slice(idx, end);
          op.buffer = op.buffer.slice(end);
          try {
            const obj = JSON.parse(objStr);
            if (specialScan && networksJson && !obj.error && obj.results) {
              return { results: [JSON.stringify({ result: JSON.stringify(networksJson) })] };
            }
            if (obj.results || obj.error) return obj;
          } catch {}
          idx = op.buffer.indexOf('{');
          continue;
        } else break;
      }
    }
  }
  if (specialScan && networksJson) return { results: [JSON.stringify({ result: JSON.stringify(networksJson) })] };
  return { error: 'Timeout' };
}
