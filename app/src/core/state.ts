import { ESPLoader, Transport } from "ffvr-esptool/index.js";

export type AppState = {
  device: any | null;
  transport: Transport | null;
  esploader: ESPLoader | null;
  chip: string | null;
  deviceMac: string | null;
  lastBaud: number;
  isConnected: boolean;
  isConsoleClosed: boolean;
  // 'boot' = ROM/bootloader mode (full flashing + console), 'runtime' = CDC firmware JSON mode (Tools only)
  connectionMode: 'boot' | 'runtime' | null;
};

export const state: AppState = {
  device: null,
  transport: null,
  esploader: null,
  chip: null,
  deviceMac: null,
  lastBaud: 115200,
  isConnected: false,
  isConsoleClosed: true,
  connectionMode: null,
};
