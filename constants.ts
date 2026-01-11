import { AppConfig } from './types';

// This acts as the "conf file" mentioned in requirements.
// In a real implementation, the backend might read a JSON file, but for this SPA,
// we define it here. New apps are added by adding objects to this array.

export const AVAILABLE_APPS: AppConfig[] = [
  {
    id: 'claudecodeui',
    name: 'Claude Code UI',
    description: "Use Claude Code, Cursor CLI or Codex on mobile and web with CloudCLI (aka Claude Code UI). CloudCLI is a free open source webui/GUI that helps you manage your Claude Code session and projects remotely",
    folderPath: '../claudecodeui',
    startCommand: 'npm run dev'
  },
  {
    id: 'agent-ui',
    name: 'Agent Management UI',
    description: "New generation of UI for managing agents",
    folderPath: '../agent-ui',
    startCommand: 'npm run dev'
  }
];

export const PORT_EXTERNAL = 4000;
export const PORT_SWITCHER = 3000;
export const STORAGE_KEY_USAGE = 'app_switcher_usage_stats';
