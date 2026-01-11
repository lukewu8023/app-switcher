const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = 3001;
const isWindows = os.platform() === 'win32';

// Store the current running process
let currentProcess = null;
let currentAppId = null;

// SSE clients for log streaming
const sseClients = [];

// Log buffer for persistence (stores last 200 entries)
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];

function addToLogBuffer(logEntry) {
  logBuffer.push({
    ...logEntry,
    timestamp: Date.now()
  });
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

function sendSSE(data) {
  // Store in buffer for new clients
  addToLogBuffer(data);

  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    client.write(message);
  });
}

function killPort4000() {
  return new Promise((resolve) => {
    if (isWindows) {
      // Windows: find and kill process on port 4000
      exec('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :4000 ^| findstr LISTENING\') do taskkill /F /PID %a', { shell: 'cmd.exe' }, (error) => {
        resolve();
      });
    } else {
      // Unix/Mac
      exec('lsof -ti:4000 | xargs kill -9 2>/dev/null || true', (error) => {
        resolve();
      });
    }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startApp(appId, startCommand, folderPath) {
  // If there's a current process, kill it
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
    currentAppId = null;
  }

  // Kill any existing process on port 4000
  await killPort4000();

  // Wait for port to be fully released
  await sleep(500);

  // Resolve the app path relative to the backend directory
  const backendDir = __dirname;
  const appPath = path.resolve(backendDir, '..', folderPath);

  sendSSE({ type: 'system', message: `Starting ${appId}...` });
  sendSSE({ type: 'info', message: `> cd ${appPath}` });
  sendSSE({ type: 'info', message: `> ${startCommand}` });

  return new Promise((resolve, reject) => {
    // Parse the start command
    const parts = startCommand.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    // On Windows, use shell to run npm commands properly
    const proc = spawn(cmd, args, {
      cwd: appPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWindows
    });

    currentProcess = proc;
    currentAppId = appId;

    let hasResolved = false;

    proc.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sendSSE({ type: 'info', message });
        // Resolve when we see common server ready patterns
        if (!hasResolved && (
          message.includes('running at') ||
          message.includes('ready in') ||
          message.includes('Server URL:') ||
          message.includes('localhost:4000') ||
          message.includes('Server - Ready')
        )) {
          hasResolved = true;
          sendSSE({ type: 'system', message: `Server ready at http://localhost:4000` });
          resolve();
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        sendSSE({ type: 'error', message });
      }
    });

    proc.on('error', (error) => {
      sendSSE({ type: 'error', message: `Process error: ${error.message}` });
      currentProcess = null;
      currentAppId = null;
      if (!hasResolved) {
        hasResolved = true;
        reject(error);
      }
    });

    proc.on('exit', (code) => {
      if (code !== null && code !== 0) {
        sendSSE({ type: 'error', message: `Process exited with code ${code}` });
      }
      currentProcess = null;
      currentAppId = null;
    });

    // Fallback timeout - resolve anyway after 2 seconds if server hasn't logged
    setTimeout(() => {
      if (!hasResolved && currentProcess === proc && !proc.killed) {
        hasResolved = true;
        sendSSE({ type: 'system', message: `Server ready at http://localhost:4000` });
        resolve();
      } else if (!hasResolved) {
        hasResolved = true;
        reject(new Error('Process failed to start'));
      }
    }, 2000);
  });
}

async function stopApp() {
  if (currentProcess) {
    sendSSE({ type: 'system', message: 'Stopping current process...' });
    currentProcess.kill('SIGTERM');
    currentProcess = null;
    currentAppId = null;
  }

  await killPort4000();
  sendSSE({ type: 'system', message: 'Application stopped. Port 4000 is free.' });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // SSE endpoint for log streaming
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send buffered logs to new client
    logBuffer.forEach(log => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    });

    sseClients.push(res);

    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index > -1) sseClients.splice(index, 1);
    });

    return;
  }

  // Kill port 4000
  if (url.pathname === '/api/kill-port' && req.method === 'POST') {
    try {
      await killPort4000();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Start app
  if (url.pathname === '/api/start' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.appId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'appId is required' }));
        return;
      }

      const startCommand = body.startCommand || 'npm run dev';
      const folderPath = body.folderPath || `../${body.appId}`;

      await startApp(body.appId, startCommand, folderPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Stop app
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    try {
      await stopApp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Status endpoint
  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running: currentProcess !== null,
      appId: currentAppId
    }));
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`App Switcher Backend running at http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await stopApp();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await stopApp();
  process.exit(0);
});
