// Lazy DOM getters to avoid capturing nulls at import time
export const el = {
  baudrates: () => document.getElementById("baudrates") as HTMLSelectElement | null,
  connectButton: () => document.getElementById("connectButton") as HTMLButtonElement | null,
  traceButton: () => document.getElementById("copyTraceButton") as HTMLButtonElement | null,
  disconnectButton: () => document.getElementById("disconnectButton") as HTMLButtonElement | null,
  resetButton: () => document.getElementById("resetButton") as HTMLButtonElement | null,
  consoleStartButton: () => document.getElementById("consoleStartButton") as HTMLButtonElement | null,
  consoleStopButton: () => document.getElementById("consoleStopButton") as HTMLButtonElement | null,
  eraseButton: () => document.getElementById("eraseButton") as HTMLButtonElement | null,
  addFileButton: () => document.getElementById("addFile") as HTMLButtonElement | null,
  programButton: () => document.getElementById("programButton") as HTMLButtonElement | null,
  prebuiltSelect: () => document.getElementById("prebuiltSelect") as HTMLSelectElement | null,
  filesDiv: () => document.getElementById("files") as HTMLElement | null,
  terminal: () => document.getElementById("terminal") as HTMLElement | null,
  programDiv: () => document.getElementById("program") as HTMLElement | null,
  consoleDiv: () => document.getElementById("console") as HTMLElement | null,
  lblBaudrate: () => document.getElementById("lblBaudrate") as HTMLElement | null,
  lblConnTo: () => document.getElementById("lblConnTo") as HTMLElement | null,
  table: () => document.getElementById("fileTable") as HTMLTableElement | null,
  alertDiv: () => document.getElementById("alertDiv") as HTMLElement | null,
  connectAlert: () => document.getElementById("connectAlert") as HTMLElement | null,
  connectAlertMsg: () => document.getElementById("connectAlertMsg") as HTMLElement | null,
  connStatusDot: () => document.getElementById("connStatusDot") as HTMLElement | null,
  debugLogging: () => document.getElementById("debugLogging") as HTMLInputElement | null,
  debugPanel: () => document.getElementById('debugPanel') as HTMLElement | null,
  debugLog: () => document.getElementById('debugLog') as HTMLElement | null,
  demoMode: () => document.getElementById("demoMode") as HTMLInputElement | null,
  showLegacy: () => document.getElementById('showLegacy') as HTMLInputElement | null,
  tabs: () => Array.from(document.querySelectorAll('#tabs .tab')) as HTMLElement[],
};

export function setTabsEnabled(enabled: boolean) {
  try {
    const tabProgram = document.querySelector('#tabs .tab[data-target="program"]') as HTMLElement | null;
    const tabConsole = document.querySelector('#tabs .tab[data-target="console"]') as HTMLElement | null;
    const tabTools = document.querySelector('#tabs .tab[data-target="tools"]') as HTMLElement | null;
    const tabUpdate = document.querySelector('#tabs .tab[data-target="update"]') as HTMLElement | null;
    [tabProgram, tabConsole, tabTools, tabUpdate].forEach(t => t && t.classList.toggle('disabled', !enabled));
  } catch {}
}

export function switchToConsoleTab() {
  const tabConsole = document.querySelector('#tabs .tab[data-target="console"]') as HTMLElement | null;
  if (tabConsole) {
    tabConsole.classList.remove('disabled');
    tabConsole.click();
    return;
  }
  const programDiv = el.programDiv();
  const consoleDiv = el.consoleDiv();
  if (programDiv && consoleDiv) {
    programDiv.style.display = 'none';
    consoleDiv.style.display = 'block';
  }
}
