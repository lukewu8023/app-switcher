import { AppConfig, LogEntry } from '../types';

const API_BASE = `http://${window.location.hostname}:3001`;

let eventSource: EventSource | null = null;

export const killPort4000 = async (): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/kill-port`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to kill port 4000');
  }
};

export const startApplicationProcess = async (
  app: AppConfig,
  onLog: (log: LogEntry) => void
): Promise<void> => {
  // Set up SSE connection for log streaming
  return new Promise((resolve, reject) => {
    // Close any existing connection
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`${API_BASE}/api/logs`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const log: LogEntry = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          message: data.message,
          type: data.type || 'info'
        };
        onLog(log);
      } catch (e) {
        console.error('Failed to parse log:', e);
      }
    };

    eventSource.onerror = () => {
      // SSE connection error - this is normal when server restarts
      console.log('SSE connection error or closed');
    };

    // Start the app via API
    fetch(`${API_BASE}/api/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appId: app.id,
        startCommand: app.startCommand || 'npm run dev',
        folderPath: app.folderPath
      })
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json();
          reject(new Error(error.error || 'Failed to start application'));
        } else {
          resolve();
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
};

export const stopApplicationProcess = async (): Promise<void> => {
  // Close SSE connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const response = await fetch(`${API_BASE}/api/stop`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to stop application');
  }
};
