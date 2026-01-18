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

// Check if port 4000 is in use
function isPort4000InUse() {
  return new Promise((resolve) => {
    if (isWindows) {
      exec('netstat -aon | findstr :4000 | findstr LISTENING', { shell: 'cmd.exe' }, (error, stdout) => {
        resolve(stdout && stdout.trim().length > 0);
      });
    } else {
      exec('lsof -ti:4000', (error, stdout) => {
        resolve(stdout && stdout.trim().length > 0);
      });
    }
  });
}

// Send graceful termination signal to port 4000
function sendGracefulTermination() {
  return new Promise((resolve) => {
    if (isWindows) {
      exec('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :4000 ^| findstr LISTENING\') do taskkill /PID %a', { shell: 'cmd.exe' }, () => resolve());
    } else {
      exec('lsof -ti:4000 | xargs kill -15 2>/dev/null || true', () => resolve());
    }
  });
}

// Graceful shutdown: poll until port is free, ask for confirmation before force kill
async function killPort4000Graceful(maxAttempts = 10, pollInterval = 500) {
  // Check if port is even in use
  if (!(await isPort4000InUse())) {
    return true;
  }

  // Send graceful termination signal
  await sendGracefulTermination();

  // Poll until port is free
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(pollInterval);
    if (!(await isPort4000InUse())) {
      return true; // Port is free, done
    }
  }

  // Still in use after polling, ask for confirmation
  sendSSE({
    type: 'confirm',
    message: 'Process on port 4000 did not stop gracefully. Force kill?',
    action: 'force_kill_port'
  });
  return false; // Indicates force kill is needed but not done
}

// Force kill immediately (for manual override)
function killPort4000Force() {
  return new Promise((resolve) => {
    if (isWindows) {
      exec('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :4000 ^| findstr LISTENING\') do taskkill /F /PID %a', { shell: 'cmd.exe' }, (error) => {
        resolve();
      });
    } else {
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
  // If there's a current process, kill it gracefully
  if (currentProcess) {
    sendSSE({ type: 'system', message: 'Stopping previous app gracefully...' });
    currentProcess.kill('SIGINT'); // Ctrl+C signal for graceful shutdown

    // Poll until process exits (up to 10 attempts, 500ms each = 5 seconds max)
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts && currentProcess; i++) {
      await sleep(500);
    }

    // If still running, ask for confirmation
    if (currentProcess) {
      sendSSE({
        type: 'confirm',
        message: 'Previous app did not stop gracefully. Force kill?',
        action: 'force_kill_process'
      });
      // Don't proceed with starting new app
      return { needsConfirmation: true, reason: 'process_running' };
    }

    currentProcess = null;
    currentAppId = null;
  }

  // Kill any existing process on port 4000 gracefully
  sendSSE({ type: 'system', message: 'Clearing port 4000...' });
  const portCleared = await killPort4000Graceful();

  if (!portCleared) {
    // Port didn't clear, confirmation was requested
    return { needsConfirmation: true, reason: 'port_in_use' };
  }

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
    sendSSE({ type: 'system', message: 'Stopping application gracefully...' });
    currentProcess.kill('SIGINT'); // Ctrl+C signal

    // Poll until process exits (up to 10 attempts, 500ms each = 5 seconds max)
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts && currentProcess; i++) {
      await sleep(500);
    }

    // If still running, ask for confirmation
    if (currentProcess) {
      sendSSE({
        type: 'confirm',
        message: 'Application did not stop gracefully. Force kill?',
        action: 'force_kill_process'
      });
      return { needsConfirmation: true };
    }

    currentProcess = null;
    currentAppId = null;
  }

  const portCleared = await killPort4000Graceful();
  if (portCleared) {
    sendSSE({ type: 'system', message: 'Application stopped. Port 4000 is free.' });
  }
  return { needsConfirmation: !portCleared };
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

  // Kill port 4000 (graceful by default, force with ?force=true)
  if (url.pathname === '/api/kill-port' && req.method === 'POST') {
    try {
      const forceKill = url.searchParams.get('force') === 'true';
      if (forceKill) {
        sendSSE({ type: 'system', message: 'Force killing process on port 4000...' });
        await killPort4000Force();
        sendSSE({ type: 'system', message: 'Port 4000 cleared.' });
      } else {
        const cleared = await killPort4000Graceful();
        if (cleared) {
          sendSSE({ type: 'system', message: 'Port 4000 cleared.' });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Force kill current process (for confirmation flow)
  if (url.pathname === '/api/force-kill-process' && req.method === 'POST') {
    try {
      if (currentProcess) {
        sendSSE({ type: 'system', message: 'Force killing current process...' });
        currentProcess.kill('SIGKILL');
        await sleep(200);
        currentProcess = null;
        currentAppId = null;
        sendSSE({ type: 'system', message: 'Process killed.' });
      }
      // Also force kill anything on port 4000
      await killPort4000Force();
      sendSSE({ type: 'system', message: 'Port 4000 cleared.' });
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

      const result = await startApp(body.appId, startCommand, folderPath);
      if (result && result.needsConfirmation) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, needsConfirmation: true, reason: result.reason }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  // Stop app
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    try {
      const result = await stopApp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: !result.needsConfirmation,
        needsConfirmation: result.needsConfirmation || false
      }));
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
