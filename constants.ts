import { AppConfig } from './types';

// This acts as the "conf file" mentioned in requirements.
// In a real implementation, the backend might read a JSON file, but for this SPA,
// we define it here. New apps are added by adding objects to this array.

export const AVAILABLE_APPS: AppConfig[] = [
  {
    id: 'app-ecommerce',
    name: 'E-Commerce Store',
    description: 'The main customer-facing mobile shopping application.',
    folderPath: './application-1'
  },
  {
    id: 'app-admin-panel',
    name: 'Admin Dashboard',
    description: 'Internal tool for managing orders, inventory, and users.',
    folderPath: './application-2'
  },
  {
    id: 'app-driver-logistics',
    name: 'Logistics Driver',
    description: 'Minimalist app for delivery drivers to track routes.',
    folderPath: './application-3'
  },
  {
    id: 'app-analytics-viz',
    name: 'Data Viz Server',
    description: 'Heavy d3.js visualization server for nightly reports.',
    folderPath: './application-4'
  }
];

export const PORT_EXTERNAL = 4000;
export const PORT_SWITCHER = 3000;
export const STORAGE_KEY_USAGE = 'app_switcher_usage_stats';