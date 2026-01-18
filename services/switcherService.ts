import { AppConfig, LogEntry } from '../types';

const API_BASE = `http://${window.location.hostname}:3001`;

let eventSource: EventSource | null = null;

export interface ServerStatus {
  running: boolean;
  appId: string | null;
}

export interface StartStopResult {
  success: boolean;
  needsConfirmation?: boolean;
  reason?: string;
}

export const getStatus = async (): Promise<ServerStatus> => {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch status');
  }
  return response.json();
};

// Callback for confirmation requests
let onConfirmCallback: ((message: string, action: string) => void) | null = null;

export const setOnConfirmCallback = (
  callback: ((message: string, action: string) => void) | null
) => {
  onConfirmCallback = callback;
};

export const subscribeToLogs = (
  onLog: (log: LogEntry) => void
): (() => void) => {
  // Close any existing connection
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${API_BASE}/api/logs`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // Handle confirmation requests
      if (data.type === 'confirm' && onConfirmCallback) {
        onConfirmCallback(data.message, data.action);
        return;
      }

      const log: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        message: data.message,
        type: data.type || 'info'
      };
      onLog(log);
    } catch (e) {
      console.error('Failed to parse log:', e);
    }
  };

  eventSource.onerror = () => {
    console.log('SSE connection error or closed');
  };

  // Return cleanup function
  return () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
};

export const killPort4000 = async (force: boolean = false): Promise<void> => {
  const url = force ? `${API_BASE}/api/kill-port?force=true` : `${API_BASE}/api/kill-port`;
  const response = await fetch(url, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to kill port 4000');
  }
};

export const forceKillProcess = async (): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/force-kill-process`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to force kill process');
  }
};

export const startApplicationProcess = async (
  app: AppConfig
): Promise<StartStopResult> => {
  const response = await fetch(`${API_BASE}/api/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      appId: app.id,
      startCommand: app.startCommand || 'npm run dev',
      folderPath: app.folderPath
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to start application');
  }

  return result;
};

export const stopApplicationProcess = async (): Promise<StartStopResult> => {
  const response = await fetch(`${API_BASE}/api/stop`, {
    method: 'POST'
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to stop application');
  }

  return result;
};
