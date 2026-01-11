export interface AppConfig {
  id: string;
  name: string;
  description: string;
  folderPath: string; // The folder relative to the switcher
  startCommand?: string; // e.g., "npm run dev"
}

export enum AppStatus {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR'
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'error' | 'system';
}

export interface UsageStats {
  [appId: string]: number;
}