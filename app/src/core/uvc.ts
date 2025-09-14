import { state } from "./state";
import { ensureTransportConnected } from "./serial";
import { sendAndExtract } from "./jsonClient";

let currentStream: MediaStream | null = null;
let matchedVideoDeviceId: string | null = null;

export async function ensureDeviceLabels(): Promise<void> {
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
    }
  } catch {}
}

export async function findAssociatedUvc(): Promise<{ deviceId: string | null; label?: string }> {
  try {
    await ensureDeviceLabels();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vids = devices.filter((d) => d.kind === "videoinput");
    // Prefer matching by advertised mdns/uvc name
    await ensureTransportConnected();
    const name = await sendAndExtract(state.transport!, "get_mdns_name");
    const targetName = (typeof name === "string" ? name : "").toLowerCase().trim();
    let match = vids.find((v) => (v.label || "").toLowerCase().includes(targetName) && v.deviceId);
    if (!match && targetName) {
      match = vids.find((v) => (v.label || "").toLowerCase().includes(targetName));
    }
    // Fallback: try product/manufacturer from connected USB if available (best effort)
    if (!match) {
      try {
        const dev: any = (state.transport as any)?.device;
        const usb = dev?.device || dev?.device_ || dev?.usbDevice || dev?._device || dev?.port_?.device;
        const prod = (usb?.productName || "").toLowerCase();
        if (prod) match = vids.find((v) => (v.label || "").toLowerCase().includes(prod));
      } catch {}
    }
    matchedVideoDeviceId = match?.deviceId || null;
    return { deviceId: matchedVideoDeviceId, label: match?.label };
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
    if (currentStream) return true; // already running
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
