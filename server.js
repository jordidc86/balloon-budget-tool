const fs = require('fs');
const path = require('path');

// Redirect console logs to a file for debugging on Hostinger
const logFile = path.join(__dirname, 'error.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line);
  logStream.write(line);
}

process.on('uncaughtException', (err) => {
  log(`CRITICAL: Uncaught Exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`CRITICAL: Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

log('--- STARTUP DIAGNOSTICS ---');
log(`Node Version: ${process.version}`);
log(`CWD: ${process.cwd()}`);
log(`NODE_ENV: ${process.env.NODE_ENV}`);
log(`DATABASE_URL set: ${!!process.env.DATABASE_URL}`);
log('---------------------------');

log('Starting production server setup...');

// Hostinger often provides the port in an env var
process.env.NODE_ENV = 'production';
if (!process.env.PORT) {
  log('PORT not found in environment, defaulting to 3000');
  process.env.PORT = 3000;
} else {
  log(`Application starting on PORT: ${process.env.PORT}`);
}

try {
  log('Attempting to load standalone server...');
  require('./.next/standalone/server.js');
} catch (e) {
  log(`ERROR loading server: ${e.message}\n${e.stack}`);
}
