# App Switcher

A simple dashboard to switch between and manage multiple applications. Each app runs on port 4000, and you can easily switch between them with a single click.

## Features

- **App Selection**: Browse and select from available applications
- **One-Click Start/Stop**: Start or stop apps with large, easy-to-use buttons
- **Auto-Switch**: When starting a different app, the running app is automatically stopped
- **Log Streaming**: View real-time logs from the running application
- **Usage Tracking**: Frequently used apps are sorted to the top

## Getting Started

### Prerequisites

- Node.js
- Applications to manage (configured in `constants.ts`)

### Installation

```bash
npm install
```

### Running

```bash
npm run dev
```

This starts both the backend (port 3001) and frontend (port 3000).

### Access

Open your browser at:
- `http://localhost:3000`
- Or your local IP: `http://192.168.x.x:3000`

## Configuration

Add or modify apps in `constants.ts`:

```typescript
export const AVAILABLE_APPS: AppConfig[] = [
  {
    id: 'my-app',
    name: 'My Application',
    description: 'Description of the app',
    folderPath: '../path/to/app'
  }
];
```

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js Express-like server
- **Port**: Apps run on port 4000
- **API**: REST API on port 3001 with SSE for log streaming

## Project Structure

```
app-switcher/
├── App.tsx              # Main React component
├── constants.ts         # App configuration
├── types.ts             # TypeScript interfaces
├── services/
│   └── switcherService.ts  # API client
├── components/
│   ├── AppCard.ts       # App selection card
│   └── LogViewer.ts     # Log display panel
└── backend/
    └── server.cjs       # Backend server
```
