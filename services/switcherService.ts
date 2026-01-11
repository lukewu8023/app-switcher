import { AppConfig, LogEntry } from '../types';

// In a real application, these functions would fetch() to a local Node.js/Python server
// that executes shell commands (e.g., `kill $(lsof -t -i:4000)` and `npm start`).

const MOCK_DELAY = 1500;

export const killPort4000 = async (): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Backend: Killed process on port 4000');
      resolve();
    }, 1000);
  });
};

export const startApplicationProcess = async (
  app: AppConfig, 
  onLog: (log: LogEntry) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Simulate startup sequence
    onLog({ id: crypto.randomUUID(), timestamp: new Date(), message: `Initializing ${app.name}...`, type: 'system' });
    
    setTimeout(() => {
      onLog({ id: crypto.randomUUID(), timestamp: new Date(), message: `> cd ${app.folderPath}`, type: 'info' });
      onLog({ id: crypto.randomUUID(), timestamp: new Date(), message: `> npm run start -- --port 4000`, type: 'info' });
    }, 500);

    setTimeout(() => {
      if (Math.random() > 0.95) {
        // Random failure simulation
        reject(new Error('EADDRINUSE: Port 4000 is still busy (Race condition simulated)'));
      } else {
        onLog({ id: crypto.randomUUID(), timestamp: new Date(), message: `Server ready at http://localhost:4000`, type: 'info' });
        onLog({ id: crypto.randomUUID(), timestamp: new Date(), message: `[HMR] connected`, type: 'system' });
        resolve();
      }
    }, MOCK_DELAY);
  });
};

export const stopApplicationProcess = async (): Promise<void> => {
  return new Promise((resolve) => {
     setTimeout(() => {
      resolve();
    }, 800);
  });
};