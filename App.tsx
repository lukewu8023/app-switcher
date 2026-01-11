import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AVAILABLE_APPS, STORAGE_KEY_USAGE } from './constants';
import { AppConfig, AppStatus, LogEntry, UsageStats } from './types';
import { AppCard } from './components/AppCard';
import { LogViewer } from './components/LogViewer';
import { startApplicationProcess, stopApplicationProcess, killPort4000, getStatus, subscribeToLogs } from './services/switcherService';

const App: React.FC = () => {
  // State
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [runningAppId, setRunningAppId] = useState<string | null>(null); // Track which app is actually running
  const [status, setStatus] = useState<AppStatus>(AppStatus.STOPPED);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Initialization: Load config and sort by frequency
  useEffect(() => {
    const rawUsage = localStorage.getItem(STORAGE_KEY_USAGE);
    const usageStats: UsageStats = rawUsage ? JSON.parse(rawUsage) : {};

    const sortedApps = [...AVAILABLE_APPS].sort((a, b) => {
      const countA = usageStats[a.id] || 0;
      const countB = usageStats[b.id] || 0;
      return countB - countA; // Descending order
    });

    setApps(sortedApps);
    if (sortedApps.length > 0) {
      setSelectedAppId(sortedApps[0].id);
    }
  }, []);

  // Sync state with backend on mount
  useEffect(() => {
    const initializeState = async () => {
      try {
        const serverStatus = await getStatus();
        if (serverStatus.running && serverStatus.appId) {
          setRunningAppId(serverStatus.appId);
          setStatus(AppStatus.RUNNING);
          setSelectedAppId(serverStatus.appId);
        }
      } catch (error) {
        console.error('Failed to fetch initial status:', error);
      }
    };
    initializeState();
  }, []);

  // Subscribe to log stream on mount
  useEffect(() => {
    const handleLog = (log: LogEntry) => {
      setLogs(prev => {
        // Deduplicate by message + close timestamp
        const isDuplicate = prev.some(
          existing =>
            existing.message === log.message &&
            Math.abs(existing.timestamp.getTime() - log.timestamp.getTime()) < 1000
        );
        if (isDuplicate) return prev;
        return [...prev.slice(-99), log];
      });
    };

    const cleanup = subscribeToLogs(handleLog);
    return cleanup;
  }, []);

  const addLog = useCallback((message: string, type: 'info' | 'error' | 'system' = 'info') => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message,
      type
    };
    setLogs(prev => [...prev.slice(-99), entry]); // Keep last 100 logs
  }, []);

  const incrementUsage = (id: string) => {
    const rawUsage = localStorage.getItem(STORAGE_KEY_USAGE);
    const usageStats: UsageStats = rawUsage ? JSON.parse(rawUsage) : {};
    usageStats[id] = (usageStats[id] || 0) + 1;
    localStorage.setItem(STORAGE_KEY_USAGE, JSON.stringify(usageStats));
  };

  const handleStart = async () => {
    if (!selectedAppId || status === AppStatus.STARTING || status === AppStatus.STOPPING) return;

    const app = apps.find(a => a.id === selectedAppId);
    if (!app) return;

    try {
      setStatus(AppStatus.STARTING);

      // Stop currently running app if different
      if (runningAppId && runningAppId !== selectedAppId) {
        addLog('Stopping previous application...', 'system');
        await stopApplicationProcess();
        await killPort4000();
        addLog('Previous application stopped.', 'system');
      }

      addLog(`Initiating sequence for ${app.name}...`, 'system');

      // Force kill port 4000
      addLog('Scanning port 4000...', 'system');
      await killPort4000();
      addLog('Port 4000 cleared.', 'system');

      // Start new app (logs will come via SSE subscription)
      incrementUsage(app.id);
      await startApplicationProcess(app);

      setRunningAppId(selectedAppId);
      setStatus(AppStatus.RUNNING);
      addLog(`${app.name} is now RUNNING on port 4000.`, 'system');

    } catch (error: any) {
      setStatus(AppStatus.ERROR);
      setRunningAppId(null);
      addLog(`Failed to start: ${error.message || 'Unknown error'}`, 'error');
    }
  };

  const handleStop = async () => {
    if (status === AppStatus.STOPPED || status === AppStatus.STOPPING) return;

    try {
      setStatus(AppStatus.STOPPING);
      addLog('Stopping current process...', 'system');
      await stopApplicationProcess();
      await killPort4000();
      setRunningAppId(null);
      setStatus(AppStatus.STOPPED);
      addLog('Application stopped. Port 4000 is free.', 'system');
    } catch (error: any) {
      setStatus(AppStatus.ERROR);
      addLog(`Error stopping app: ${error.message}`, 'error');
    }
  };

  const selectedApp = useMemo(() => apps.find(a => a.id === selectedAppId), [apps, selectedAppId]);

  // START button is enabled when: not busy AND (nothing running OR selected app is different from running)
  const canStart = status !== AppStatus.STARTING && status !== AppStatus.STOPPING &&
    (status === AppStatus.STOPPED || status === AppStatus.ERROR || selectedAppId !== runningAppId);

  // STOP button is enabled when: app is running AND selected app is the running app
  const canStop = status === AppStatus.RUNNING && selectedAppId === runningAppId;

  // Display status for the selected app (not the global status)
  const displayStatus = (status === AppStatus.STARTING || status === AppStatus.STOPPING)
    ? status  // Show STARTING/STOPPING during transitions
    : (selectedAppId === runningAppId && status === AppStatus.RUNNING)
      ? AppStatus.RUNNING
      : status === AppStatus.ERROR
        ? AppStatus.ERROR
        : AppStatus.STOPPED;

  return (
    <div className="relative h-[100dvh] w-full bg-slate-950 text-white overflow-hidden flex flex-col">
      
      {/* Scrollable Content Area */}
      {/* We use min-h-full inside the scroll container to ensure flex alignment works */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full">
        <div className="flex flex-col min-h-full">
          
          {/* Header / App Selector */}
          <div className="pt-[100px] pb-2 px-0 shrink-0">
            <h1 className="text-center text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
              Select Application
            </h1>
            
            {/* Carousel Container */}
            <div className="flex overflow-x-auto snap-x snap-mandatory px-[10vw] no-scrollbar pb-4">
              {apps.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  isSelected={selectedAppId === app.id}
                  onClick={() => {
                    if (selectedAppId === app.id) return; // Already selected
                    if (status === AppStatus.STARTING || status === AppStatus.STOPPING) return; // Busy
                    setSelectedAppId(app.id);
                  }} 
                />
              ))}
            </div>
          </div>

          {/* Center Controls - Flex Grow to take remaining space and center content */}
          <div className="flex-grow flex flex-col items-center justify-center px-4 py-4">
            
            {/* Status Indicator */}
            <div className="mb-4 flex flex-col items-center animate-fade-in-up">
              <div className="text-slate-400 text-sm mb-1">Target Status</div>
              <div className={`text-2xl font-black tracking-tight flex items-center gap-3
                ${displayStatus === AppStatus.RUNNING ? 'text-green-400' :
                  displayStatus === AppStatus.STOPPED ? 'text-slate-500' :
                  displayStatus === AppStatus.ERROR ? 'text-red-500' : 'text-yellow-400'}
              `}>
                 {displayStatus === AppStatus.RUNNING && <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"/>}
                 {displayStatus}
              </div>
              {selectedApp && (
                <div className="mt-2 px-3 py-1 bg-slate-900 rounded-full text-xs text-slate-500 border border-slate-800">
                  {selectedApp.id}
                </div>
              )}
            </div>

            {/* Big Buttons */}
            <div className="flex gap-6 sm:gap-8 items-center relative z-[60]">
              {/* STOP Button */}
              <button
                onClick={handleStop}
                disabled={!canStop}
                className={`
                  w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center
                  border-4 transition-all duration-300 shadow-2xl shrink-0
                  ${canStop
                    ? 'bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500 hover:text-white hover:scale-105 cursor-pointer'
                    : 'bg-slate-900 border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                  }
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                <span className="font-bold tracking-wider text-sm sm:text-base">STOP</span>
              </button>

              {/* START Button */}
              <button
                onClick={handleStart}
                disabled={!canStart}
                className={`
                  w-32 h-32 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center
                  border-4 transition-all duration-300 shadow-[0_0_40px_rgba(74,222,128,0.2)] shrink-0
                  ${canStart
                    ? 'bg-green-500 text-white border-green-400 hover:scale-110 cursor-pointer hover:shadow-[0_0_60px_rgba(74,222,128,0.4)]'
                    : 'bg-slate-900 border-slate-800 text-slate-700 opacity-50 cursor-not-allowed'
                  }
                `}
              >
                 {status === AppStatus.STARTING || status === AppStatus.STOPPING ? (
                    <svg className="animate-spin h-10 w-10 sm:h-12 sm:w-12 mb-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                 ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 sm:h-14 sm:w-14 mb-1 pl-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                 )}
                <span className="font-bold tracking-wider text-sm sm:text-base">
                  {status === AppStatus.STARTING ? 'WAIT' : 'START'}
                </span>
              </button>
            </div>
            
            <div className="mt-3 text-slate-500 text-xs text-center whitespace-nowrap">
              {status === AppStatus.RUNNING 
                ? 'Process active. Logs streaming below.' 
                : 'Select an app and press Start to launch on port 4000.'}
            </div>

          </div>

          {/* Bottom Spacer for LogViewer */}
          {/* This spacer ensures that the 'justify-center' above treats this area as occupied 
              so content centers in the visible area, and provides scroll space. */}
          <div className="shrink-0 h-[160px]" />
        </div>
      </div>

      {/* Bottom Log Area - Fixed on top of the scroll view */}
      <LogViewer logs={logs} />
      
    </div>
  );
};

export default App;
