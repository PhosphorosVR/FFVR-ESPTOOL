import { state } from "./state";
import { ensureTransportConnected } from "./serial";
import { sendAndExtract } from "./jsonClient";

let currentStream: MediaStream | null = null;
let matchedVideoDeviceId: string | null = null;

export async function ensureDeviceLabels(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devices.some((d) => d.kind === "videoinput" && d.label);
    if (!hasLabels) {
      // Request a temporary generic camera stream to unlock labels; then stop it
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tmp.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      return true;
    }
    return true;
  } catch {
    // Permission may be blocked or no camera available
    return false;
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreLabel(label: string, targetName: string, productHint?: string): number {
  const L = norm(label);
  const T = norm(targetName);
  const P = productHint ? norm(productHint) : "";
  let score = 0;
  if (!label) return -999;
  if (T && L === T) score += 120;
  if (T && L.startsWith(T)) score += 80;
  if (T && L.includes(T)) score += 50;
  // Prefer same family keywords
  const hasEyeL = /\beye\b/.test(L);
  const hasFaceL = /\bface\b/.test(L) || /fdace/.test(L);
  const hasEyeT = /\beye\b/.test(T);
  const hasFaceT = /\bface\b/.test(T) || /fdace/.test(T);
  if (hasEyeL && hasEyeT) score += 25;
  if (hasFaceL && hasFaceT) score += 25;
  if (hasEyeT && hasFaceL) score -= 40; // avoid face when target is eye
  if (hasFaceT && hasEyeL) score -= 20;
  // Sidedness hints (R/L)
  const wantsR = /\br\b|\bright\b/.test(T);
  const wantsL = /\bl\b|\bleft\b/.test(T);
  const hasR = /\br\b|\bright\b/.test(L);
  const hasL = /\bl\b|\bleft\b/.test(L);
  if (wantsR && hasR) score += 20;
  if (wantsL && hasL) score += 20;
  if (wantsR && hasL) score -= 15;
  if (wantsL && hasR) score -= 15;
  // Product hint helps break ties
  if (P) {
    if (L.includes(P)) score += 10;
  }
  // Prefer labels that look like the brand
  if (/ffvr|openiris/.test(L)) score += 5;
  return score;
}

export async function findAssociatedUvc(): Promise<{ deviceId: string | null; label?: string }> {
  try {
    await ensureDeviceLabels();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vids = devices.filter((d) => d.kind === "videoinput");
    // Prefer matching by advertised mdns/uvc name
    await ensureTransportConnected();
    const name = await sendAndExtract(state.transport!, "get_mdns_name");
    const targetName = typeof name === "string" ? name : "";
    let productHint = "";
    try {
      const dev: any = (state.transport as any)?.device;
      const usb = dev?.device || dev?.device_ || dev?.usbDevice || dev?._device || dev?.port_?.device;
      productHint = usb?.productName || "";
    } catch {}

    // Rank all candidates and pick the highest scoring one
    let best = { score: -9999, dev: null as MediaDeviceInfo | null };
    for (const v of vids) {
      const s = scoreLabel(v.label || "", targetName, productHint);
      if (s > best.score) best = { score: s, dev: v };
    }

    // If score is weak (<=0), try a second pass using only product hint
    if ((!best.dev || best.score <= 0) && productHint) {
      for (const v of vids) {
        const L = norm(v.label || "");
        if (L.includes(norm(productHint))) { best = { score: 1, dev: v }; break; }
      }
    }

    matchedVideoDeviceId = best.dev?.deviceId || null;
    return { deviceId: matchedVideoDeviceId, label: best.dev?.label };
  } catch {
    matchedVideoDeviceId = null;
    return { deviceId: null };
  }
}

export async function startUvcPreview(video: HTMLVideoElement, info?: HTMLElement): Promise<boolean> {
  try {
    if (!matchedVideoDeviceId) {
      const assoc = await findAssociatedUvc();
      matchedVideoDeviceId = assoc.deviceId;
      if (info) info.textContent = assoc.deviceId ? `Found UVC: ${assoc.label || "camera"} (ready)` : "UVC device not found";
      if (!matchedVideoDeviceId) return false;
    }
    // If already running but against the wrong device (e.g., labels unlocked later), switch.
    if (currentStream) {
      const tracks = currentStream.getVideoTracks();
      const settings = tracks[0]?.getSettings?.();
      const currentDeviceId = (settings && (settings as any).deviceId) || null;
      if (currentDeviceId && matchedVideoDeviceId && currentDeviceId !== matchedVideoDeviceId) {
        try { stopUvcPreview(video); } catch {}
      } else {
        return true; // already on the right device
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: matchedVideoDeviceId } },
      audio: false,
    });
    currentStream = stream;
    (video as any).srcObject = stream;
    // Wait for dimensions, then size the element to match aspect and avoid bars
    await new Promise<void>((resolve) => {
      if (video.readyState >= 1) return resolve();
      const handler = () => { try { video.removeEventListener('loadedmetadata', handler); } catch {}; resolve(); };
      video.addEventListener('loadedmetadata', handler, { once: true });
    });
    try { adjustVideoSize(video, 240); } catch {}
    try { await (video as any).play?.(); } catch {}
    return true;
  } catch (e) {
    if (info) info.textContent = `Failed to open UVC: ${(e as any)?.message || e}`;
    return false;
  }
}

export function stopUvcPreview(video: HTMLVideoElement): void {
  try {
    if (currentStream) {
      currentStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    }
  } catch {}
  currentStream = null;
  (video as any).srcObject = null;
}

export function isUvcPreviewActive(): boolean {
  return !!currentStream;
}

function adjustVideoSize(video: HTMLVideoElement, maxDim = 240) {
  const vw = video.videoWidth || maxDim;
  const vh = video.videoHeight || maxDim;
  if (!vw || !vh) return;
  let width = maxDim;
  let height = maxDim;
  if (vw >= vh) {
    width = maxDim;
    height = Math.round((vh / vw) * maxDim);
  } else {
    height = maxDim;
    width = Math.round((vw / vh) * maxDim);
  }
  video.style.width = `${width}px`;
  video.style.height = `${height}px`;
  video.style.background = 'transparent';
}
