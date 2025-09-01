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
};
