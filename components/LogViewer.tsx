import React, { useState, useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  // We show strictly 3 lines when collapsed roughly by height calculation, 
  // or use CSS clamping. Here we rely on container height + overflow hidden.
  
  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0
        bg-slate-900 border-t border-slate-700
        shadow-[0_-5px_20px_rgba(0,0,0,0.5)]
        transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        z-[70] flex flex-col
        ${isExpanded ? 'h-[calc(100dvh-100px)] rounded-t-xl' : 'h-[140px]'}
      `}
    >
      {/* Handle / Header */}
      <div 
        onClick={toggleExpand}
        className="h-10 w-full flex items-center justify-center shrink-0 cursor-pointer active:bg-slate-800 transition-colors"
      >
        <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
      </div>

      {/* Log Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-4 font-mono text-xs sm:text-sm space-y-1 no-scrollbar select-text"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic p-2 text-center">No logs available. Ready to start.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 break-all animate-fade-in">
              <span className="text-slate-500 shrink-0">
                [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
              </span>
              <span className={`
                ${log.type === 'error' ? 'text-red-400' : ''}
                ${log.type === 'system' ? 'text-indigo-400' : 'text-slate-300'}
              `}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};