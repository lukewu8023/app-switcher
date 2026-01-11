import React from 'react';
import { AppConfig } from '../types';

interface AppCardProps {
  app: AppConfig;
  isSelected: boolean;
  onClick: () => void;
}

export const AppCard: React.FC<AppCardProps> = ({ app, isSelected, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        snap-center shrink-0 w-[80vw] sm:w-[300px] 
        flex flex-col justify-between
        rounded-2xl p-6 mr-4 last:mr-0 cursor-pointer transition-all duration-300
        border-2
        ${isSelected 
          ? 'bg-[#1e40af] border-[#3b82f6] shadow-[0_4px_20px_rgba(29,78,216,0.25)] scale-100' 
          : 'bg-slate-800 border-slate-700 opacity-70 scale-95 hover:opacity-100'
        }
      `}
    >
      <div>
        <div className="flex items-center space-x-2 mb-3">
            <div className={`w-3 h-3 rounded-full ${isSelected ? 'bg-blue-200 shadow-sm' : 'bg-slate-500'}`} />
            <h3 className="text-xl font-bold text-white truncate">{app.name}</h3>
        </div>
        <p className={`text-sm leading-relaxed line-clamp-3 ${isSelected ? 'text-blue-100' : 'text-slate-300'}`}>
          {app.description}
        </p>
      </div>
      
      <div className={`mt-4 pt-4 border-t flex justify-between items-center text-xs font-mono ${isSelected ? 'border-blue-400/30 text-blue-200' : 'border-white/10 text-slate-400'}`}>
        <span>{app.folderPath}</span>
        <span>ID: {app.id.split('-')[1]}</span>
      </div>
    </div>
  );
};