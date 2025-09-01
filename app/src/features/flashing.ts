import { state } from "../core/state";
import type { FlashOptions } from "ffvr-esptool/index.js";
import { prebuiltItems } from "./firmwareManifest";

declare let Terminal;
declare let CryptoJS;

export function handleFileSelect(evt: any) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev: ProgressEvent<FileReader>) => {
    evt.target.data = (ev.target as any).result;
  };
  reader.readAsBinaryString(file);
}

export function validateProgramInputs(table: HTMLTableElement): string {
  const offsetArr: number[] = [];
  const rowCount = (table as any).rows.length;
  let row;
  let offset = 0;
  for (let index = 1; index < rowCount; index++) {
    row = (table as any).rows[index];
    const fileObj = row.cells[1].childNodes[0] as ChildNode & { data?: string };
    const fileData = (fileObj as any)?.data;
    if (fileData == null) {
      continue;
    }
    const offSetObj = row.cells[0].childNodes[0] as HTMLInputElement;
    offset = parseInt(offSetObj.value as any);
    if (Number.isNaN(offset)) return "Offset field in row " + index + " is not a valid address!";
    else if (offsetArr.includes(offset)) return "Offset field in row " + index + " is already in use!";
    else offsetArr.push(offset);
  }
  return "success";
}

export function addRow(table: HTMLTableElement, defaultOffset: string = '0x10000') {
  const tbody = document.getElementById('tableBody') as HTMLTableSectionElement | null;
  const row = (tbody ? tbody.insertRow(-1) : (table as any).insertRow(-1));
  const c0 = row.insertCell(0);
  const off = document.createElement('input');
  off.type = 'text';
  off.value = defaultOffset;
  off.className = 'offset-input';
  c0.appendChild(off);
  const c1 = row.insertCell(1);
  const inp = document.createElement('input') as HTMLInputElement & { data?: string };
  inp.type = 'file';
  inp.accept = '.bin,application/octet-stream';
  inp.addEventListener('change', handleFileSelect as any);
  c1.appendChild(inp);
  const c2 = row.insertCell(2);
  c2.className = 'progress-cell';
  const prog = document.createElement('progress') as HTMLProgressElement;
  (prog as any).max = 100; (prog as any).value = 0;
  c2.style.display = 'none';
  c2.appendChild(prog);
  try {
    const fileTable = document.getElementById('fileTable') as HTMLElement | null;
    const empty = document.getElementById('fileEmpty') as HTMLElement | null;
    if (fileTable) {
      fileTable.classList.add('has-rows');
      (fileTable as any).style.display = 'table';
    }
    if (empty) empty.style.display = 'none';
  } catch {}
}

export async function performFlash(table: HTMLTableElement, prebuiltSelect: HTMLSelectElement | null, alertDiv: HTMLElement | null, term: any) {
  const alertMsg = document.getElementById("programAlertMsg");
  try { (alertDiv as any)?.classList?.remove('success'); } catch {}
  let programAlertTimer: any = null;
  try { if ((programAlertTimer)) { clearTimeout(programAlertTimer); programAlertTimer = null; } } catch {}
  const hasPrebuilt = !!(prebuiltSelect && (prebuiltSelect as any).value);
  let hasCustom = false;
  for (let index = 1; index < (table as any).rows.length; index++) {
    const row = (table as any).rows[index];
    const fileObj = row?.cells?.[1]?.childNodes?.[0] as (ChildNode & { data?: string }) | undefined;
    if (fileObj && (fileObj as any).data) { hasCustom = true; break; }
  }
  try {
    const fileTable = document.getElementById('fileTable') as HTMLElement | null;
    const empty = document.getElementById('fileEmpty') as HTMLElement | null;
    if (fileTable) fileTable.classList.toggle('has-rows', !!hasCustom);
    if (fileTable) (fileTable as any).style.display = hasCustom ? 'table' : 'none';
    if (empty) empty.style.display = hasCustom ? 'none' : 'block';
  } catch {}
  if (!hasPrebuilt && !hasCustom) {
    (alertMsg as any).textContent = "Please select a firmware from the dropdown or upload a file first.";
    (alertDiv as any).style.display = "block";
    return;
  }
  const err = validateProgramInputs(table);
  if (err != "success") {
    (alertMsg as any).innerHTML = "<strong>" + err + "</strong>";
    (alertDiv as any).style.display = "block";
    return;
  }
  (alertDiv as any).style.display = "none";
  const fileArray = [] as Array<{ data: string; address: number }>;
  const progressBars: HTMLProgressElement[] = [];
  for (let index = 1; index < (table as any).rows.length; index++) {
    const row = (table as any).rows[index];
    const fileObj = row.cells[1].childNodes[0] as ChildNode & { data?: string };
    const fileData = (fileObj as any)?.data;
    if (!fileData) continue;
    const offSetObj = row.cells[0].childNodes[0] as HTMLInputElement;
    const offset = parseInt((offSetObj as any).value);
    const progressBar = row.cells[2].childNodes[0] as HTMLProgressElement;
    (progressBar as any).value = 0;
    progressBars.push(progressBar);
    (row.cells[2] as any).style.display = "initial";
    fileArray.push({ data: fileData, address: offset });
  }
  if (prebuiltSelect && (prebuiltSelect as any).value) {
    try {
      const idx = parseInt((prebuiltSelect as any).value, 10);
      const item = prebuiltItems[idx];
      if (item && item.file) {
        const base = item.source === 'legacy' ? './binaries/legacy' : './binaries';
        const res = await fetch(`${base}/${item.file}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const addr = item.address ? parseInt(item.address) : 0x0;
        fileArray.push({ data: bin, address: addr });
      }
    } catch (e) {
      console.error("Failed to load prebuilt firmware:", e);
      (alertMsg as any).textContent = "Failed to load selected firmware.";
      (alertDiv as any).style.display = "block";
      return;
    }
  }
  try {
    // Switch to console view so the user sees progress
    try {
      const tabs = Array.from(document.querySelectorAll('#tabs .tab')) as HTMLElement[];
      const consoleTab = tabs.find(t => t.dataset.target === 'console');
      if (consoleTab && !consoleTab.classList.contains('disabled')) consoleTab.click();
    } catch {}
    const flashOptions: FlashOptions = {
      fileArray: fileArray,
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const bar = progressBars[fileIndex];
        if (bar) (bar as any).value = (written / total) * 100;
      },
      calculateMD5Hash: (image) => (CryptoJS as any).MD5((CryptoJS as any).enc.Latin1.parse(image)),
    } as FlashOptions;
    await state.esploader!.writeFlash(flashOptions);
    await state.esploader!.after();
    try {
      (alertMsg as any).textContent = 'Flashing successful. Please reconnect.';
      (alertDiv as any).classList.add('success');
      (alertDiv as any).style.display = 'block';
    } catch {}
    try {
      term?.writeln?.('\r\n[Flashing successful]');
    } catch {}
    try {
      setTimeout(() => {
        try { sessionStorage.setItem('flashReload', '1'); } catch {}
        window.location.reload();
      }, 1500);
    } catch {}
  } catch (e: any) {
    console.error(e);
    term?.writeln?.(`Error: ${e.message}`);
  } finally {
    for (let index = 1; index < (table as any).rows.length; index++) {
      (table as any).rows[index].cells[2].style.display = "none";
    }
  }
}
