import { dbg } from "../ui/debug";

export type FirmwareItem = { name?: string; file: string; address?: string; source?: 'binaries' | 'legacy' };

export let prebuiltItems: Array<FirmwareItem> = [];
export let legacyItems: Array<FirmwareItem> = [];
export let prebuiltGroups: string[] | null = null;
export const groupIndexMap: Map<string, number[]> = new Map();
let legacyMerged = false;

async function fetchJson(url: string) {
  try { const res = await fetch(url, { cache: "no-store" }); if (!res.ok) return null; return await res.json(); } catch (_) { return null; }
}
async function fetchText(url: string) {
  try { const res = await fetch(url, { cache: "no-store" }); if (!res.ok) return null; const ct = res.headers.get('content-type') || ''; if (!/text\/(html|plain)|application\/xhtml\+xml/i.test(ct) && ct) return null; return await res.text(); } catch (_) { return null; }
}
function parseAddrFromName(filename: string): string | undefined { const m = filename.match(/^0x([0-9a-fA-F]+)[_-]/); return m ? `0x${m[1]}` : undefined; }

export function categorizeFirmwareItem(it: FirmwareItem): string {
  try {
    const file = String(it.file || '').toLowerCase();
    const src = String(it.source || '').toLowerCase();
    if (src === 'legacy' || file.startsWith('legacy/')) return 'Legacy';
    if (file.indexOf('esp8266') !== -1) return 'ESP8266';
    if (file.indexOf('esp32') !== -1 || /esp32s|esp32c|esp32p|esp32h/.test(file)) return 'ESP32 family';
    if (file.indexOf('xiao') !== -1 || file.indexOf('seeed') !== -1) return 'XIAO / Seeed';
    if (file.indexOf('ffvr') !== -1 || file.indexOf('ffv') !== -1) return 'FFVR';
    if (file.indexOf('8266') !== -1) return 'ESP8266';
    return 'Other';
  } catch (_) { return 'Other'; }
}

export function renderPrebuiltSelect() {
  const prebuiltSelect = document.getElementById("prebuiltSelect") as HTMLSelectElement | null;
  if (!prebuiltSelect) return;
  while (prebuiltSelect.children.length > 1) {
    prebuiltSelect.removeChild(prebuiltSelect.lastChild as ChildNode);
  }
  if (prebuiltGroups && prebuiltGroups.length) {
    prebuiltGroups = prebuiltGroups.filter((v, i, a) => a.indexOf(v) === i);
    // Board-specific groups to hide in UI, but still usable internally for auto-detect
    const hiddenBoardGroups = new Set(['facefocusvr_face','facefocusvr_eye_l','facefocusvr_eye_r','FFVR (all)']);
    const aggregatedFfvr: number[] = [];
    for (const cat of prebuiltGroups) {
      const indices = groupIndexMap.get(cat) || [];
      if (!indices.length) continue;
      if (hiddenBoardGroups.has(cat)) {
        aggregatedFfvr.push(...indices);
      }
    }
    // Insert aggregated FFVR group first (if any)
    if (aggregatedFfvr.length) {
      const unique = Array.from(new Set(aggregatedFfvr));
      unique.sort((a,b) => String(prebuiltItems[a].file).localeCompare(String(prebuiltItems[b].file)));
      const ogFFVR = document.createElement('optgroup');
      ogFFVR.label = 'FFVR';
      const seenFiles = new Set<string>();
      unique.forEach(idx => {
        const it = prebuiltItems[idx]; if (!it) return;
        const label = (it.file || it.name || `item ${idx}`) as string;
        if (seenFiles.has(label)) return; // avoid duplicates
        seenFiles.add(label);
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = label;
        opt.title = it.source === 'legacy' ? `${label} (legacy)` : label;
        if (/face/i.test(label)) opt.dataset.board = 'facefocusvr_face';
        else if (/eye\s*L/i.test(label)) opt.dataset.board = 'facefocusvr_eye_l';
        else if (/eye\s*R/i.test(label)) opt.dataset.board = 'facefocusvr_eye_r';
        ogFFVR.appendChild(opt);
      });
      prebuiltSelect.appendChild(ogFFVR);
    }
    // Render remaining (non-hidden) groups after FFVR
    for (const cat of prebuiltGroups) {
      if (hiddenBoardGroups.has(cat)) continue;
      const indices = groupIndexMap.get(cat) || [];
      if (!indices.length) continue;
      const og = document.createElement('optgroup');
      og.label = cat;
      const seen = new Set<string>();
      indices.forEach(idx => {
        const it = prebuiltItems[idx]; if (!it) return;
        const label = (it.file || it.name || `item ${idx}`) as string;
        // Only dedupe non-Legacy groups; in Legacy we want to show every entry explicitly
        if (og.label !== 'Legacy') {
          if (seen.has(label)) return;
          seen.add(label);
        }
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = label;
        opt.title = it.source === 'legacy' ? `${label} (legacy)` : label;
        og.appendChild(opt);
      });
      if (og.children.length) prebuiltSelect.appendChild(og);
    }
    const assigned = new Set<number>();
    for (const idxs of groupIndexMap.values()) idxs.forEach(i => assigned.add(i));
    const leftover: number[] = [];
    prebuiltItems.forEach((_, i) => { if (!assigned.has(i)) leftover.push(i); });
    if (leftover.length) {
      const og = document.createElement('optgroup');
      og.label = 'Other';
      leftover.sort((a, b) => String(prebuiltItems[a].file).localeCompare(String(prebuiltItems[b].file)));
      leftover.forEach(idx => {
        const it = prebuiltItems[idx];
        const opt = document.createElement('option');
        opt.value = String(idx);
        const label = it.file || it.name || `item ${idx}`;
        opt.textContent = label;
        opt.title = it.source === 'legacy' ? `${label} (legacy)` : label;
        og.appendChild(opt);
      });
      prebuiltSelect.appendChild(og);
    }
    return;
  }
  const groups = new Map<string, Array<{idx: number; it: FirmwareItem}>>();
  prebuiltItems.forEach((it, idx) => {
    const cat = categorizeFirmwareItem(it);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push({ idx, it });
  });
  const preferred = ['ESP32 family', 'ESP8266', 'XIAO / Seeed', 'FFVR', 'Other', 'Legacy'];
  const remaining = Array.from(groups.keys()).filter(k => preferred.indexOf(k) === -1).sort();
  const finalOrder: string[] = [];
  for (const p of preferred) if (groups.has(p)) finalOrder.push(p);
  for (const r of remaining) if (!finalOrder.includes(r)) finalOrder.push(r);
  for (const cat of finalOrder) {
    const entries = groups.get(cat) || [];
    if (!entries.length) continue;
    const og = document.createElement('optgroup');
    og.label = cat;
    entries.sort((a, b) => String(a.it.file).localeCompare(String(b.it.file)));
    entries.forEach(({ idx, it }) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      const label = it.file || it.name || `item ${idx}`;
      opt.textContent = label;
      opt.title = it.source === 'legacy' ? `${label} (legacy)` : label;
      og.appendChild(opt);
    });
    prebuiltSelect.appendChild(og);
  }
}

export async function loadPrebuiltManifest() {
  try {
    const json = await fetchJson("./binaries/manifest.json");
    if (json && Array.isArray((json as any).groups)) {
      prebuiltItems = [];
      prebuiltGroups = [];
      groupIndexMap.clear();
      let globalIdx = 0;
      for (const g of (json as any).groups) {
        const gname = String((g as any).name || '');
        if (!gname) continue;
        prebuiltGroups!.push(gname);
        groupIndexMap.set(gname, []);
        const its = Array.isArray((g as any).items) ? (g as any).items : [];
        for (const raw of its) {
          let it: FirmwareItem | null = null;
          if (typeof raw === 'string') {
            it = { file: raw, name: raw, address: parseAddrFromName(raw), source: 'binaries' };
          } else if (raw && ((raw as any).file || (raw as any).name)) {
            const file = (raw as any).file || (typeof (raw as any).name === 'string' && (raw as any).name.endsWith('.bin') ? (raw as any).name : undefined);
            if (!file) continue;
            it = { file, name: (raw as any).name, address: (raw as any).address ?? parseAddrFromName(file), source: 'binaries' } as FirmwareItem;
          }
          if (it) {
            prebuiltItems.push(it);
            groupIndexMap.get(gname)!.push(globalIdx);
            globalIdx++;
          }
        }
      }
    } else if (Array.isArray((json as any)?.items)) {
      prebuiltItems = (json as any).items
        .map((it: any) => {
          if (typeof it === 'string') {
            const file = it;
            return { file, name: file, address: parseAddrFromName(file), source: 'binaries' } as FirmwareItem;
          }
          const file = it?.file || (typeof it?.name === 'string' && it.name.endsWith('.bin') ? it.name : undefined);
          if (!file) return null;
          const address = it?.address ?? parseAddrFromName(file);
          return { file, name: it?.name, address, source: 'binaries' } as FirmwareItem;
        })
        .filter(Boolean) as FirmwareItem[];
      prebuiltGroups = null;
      groupIndexMap.clear();
    } else {
      const html = await fetchText("./binaries/");
      if (html) {
        const binSet = new Set<string>();
        const re = /href=\"([^\"]+\.bin)\"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          let href = m[1];
          if (href.startsWith("http") || href.startsWith("//")) continue;
          if (href.startsWith("/")) continue;
          href = href.replace(/^\.\//, "");
          if (href.includes("/")) continue;
          binSet.add(href);
        }
        prebuiltItems = Array.from(binSet).sort().map((file) => ({ file, name: file, address: parseAddrFromName(file), source: 'binaries' }));
      } else {
        prebuiltItems = [];
      }
    }
    try {
      const movedToLegacy: FirmwareItem[] = [];
      const newPrebuilt: FirmwareItem[] = [];
      const indexRemap: number[] = [];
      for (let i = 0; i < prebuiltItems.length; i++) {
        const it = prebuiltItems[i];
        if (typeof it.file === 'string' && it.file.startsWith('legacy/')) {
          const basename = it.file.replace(/^legacy\//, '');
          movedToLegacy.push({ ...it, file: basename, source: 'legacy' });
        } else {
          indexRemap.push(newPrebuilt.length);
          newPrebuilt.push(it);
        }
      }
      if (prebuiltGroups && prebuiltGroups.length) {
        const newMap = new Map<string, number[]>();
        for (const g of prebuiltGroups) {
          const oldIdxs = groupIndexMap.get(g) || [];
          const remapped: number[] = [];
          for (const oldIdx of oldIdxs) {
            const kept = indexRemap[oldIdx];
            if (kept !== undefined) remapped.push(kept);
          }
          newMap.set(g, remapped);
        }
        groupIndexMap.clear();
        for (const [k, v] of newMap.entries()) groupIndexMap.set(k, v);
      }
      prebuiltItems = newPrebuilt;
      if (movedToLegacy.length) {
        legacyItems = [...movedToLegacy, ...legacyItems];
      }
    } catch {}
    renderPrebuiltSelect();
  // No longer auto-select: recommendation stored in sessionStorage (ffvr_recommended_value)
  } catch (e) {
  dbg(`No prebuilt list or failed to load. ${((e as any)?.message ?? e)}`, 'info');
  }
}

export async function loadLegacyManifest() {
  try {
    const json = await fetchJson("./binaries/legacy/manifest.json");
    if (Array.isArray((json as any)?.items)) {
      legacyItems = (json as any).items
        .map((it: any) => {
          if (typeof it === 'string') {
            const file = it;
            return { file, name: file, address: parseAddrFromName(file), source: 'legacy' } as FirmwareItem;
          }
          const file = it?.file || (typeof it?.name === 'string' && it.name.endsWith('.bin') ? it.name : undefined);
          if (!file) return null;
          const address = it?.address ?? parseAddrFromName(file);
          return { file, name: it?.name, address, source: 'legacy' } as FirmwareItem;
        })
        .filter(Boolean) as FirmwareItem[];
    } else {
      const html = await fetchText("./binaries/legacy/");
      if (html) {
        const binSet = new Set<string>();
        const re = /href=\"([^\"]+\.bin)\"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          let href = m[1];
          if (href.startsWith("http") || href.startsWith("//")) continue;
          if (href.startsWith("/")) continue;
          href = href.replace(/^\.\//, "");
          if (href.includes("/")) continue;
          binSet.add(href);
        }
        legacyItems = Array.from(binSet).sort().map((file) => ({ file, name: file, address: parseAddrFromName(file), source: 'legacy' }));
      } else {
        legacyItems = [];
      }
    }
  } catch (_) {
    legacyItems = [];
  }
}

export function wireLegacyToggle() {
  const showLegacyEl = document.getElementById('showLegacy') as HTMLInputElement | null;
  if (!showLegacyEl) return;
  showLegacyEl.addEventListener('change', async () => {
    if (showLegacyEl.checked) {
      if (prebuiltGroups && prebuiltGroups.includes('Legacy') && (groupIndexMap.get('Legacy')?.length ?? 0) > 0) {
        legacyMerged = true;
        renderPrebuiltSelect();
        return;
      }
      if (!legacyItems.length) await loadLegacyManifest();
      if (!legacyMerged) {
        if (prebuiltGroups && prebuiltGroups.length) {
          const startIdx = prebuiltItems.length;
          for (const it of legacyItems) prebuiltItems.push({ ...it, source: 'legacy' });
          const legacyIdxs = legacyItems.map((_, i) => startIdx + i);
          if (!prebuiltGroups.includes('Legacy')) prebuiltGroups.push('Legacy');
          groupIndexMap.set('Legacy', legacyIdxs);
        } else {
          prebuiltItems = [...prebuiltItems, ...legacyItems];
        }
        legacyMerged = true;
        renderPrebuiltSelect();
      }
    } else {
      if (legacyMerged) {
        await loadPrebuiltManifest();
        legacyMerged = false;
      }
    }
  });
  if (showLegacyEl.checked) {
    showLegacyEl.dispatchEvent(new Event('change'));
  }
}
