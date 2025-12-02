/**
 * Test Server
 *
 * Serves static files AND provides /run-test endpoint to trigger Playwright tests.
 * Supports both SFT (Short-Form Test) and LFT (Long-Form Test).
 *
 * Usage: node test-server.js [port]
 * Default port: 8000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.argv[2] || 8000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
};

const TEST_SPECS = {
  sft: 'tests/short-form-test.spec.js',
  lft: 'tests/long-form-test.spec.js'
};

let testRunning = false;
let testProcess = null;

function serveFile(res, filepath) {
  const ext = path.extname(filepath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function runTest(res, testType, pdfPath) {
  if (testRunning) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Test already running' }));
    return;
  }

  // Validate test type
  const testSpec = TEST_SPECS[testType] || TEST_SPECS.lft;

  testRunning = true;
  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Pass PDF path as environment variable
  const env = { ...process.env };
  if (pdfPath) {
    env.TEST_PDF = pdfPath;
  }

  testProcess = spawn('npx', ['playwright', 'test', testSpec, '--project=chromium'], {
    cwd: ROOT,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  testProcess.stdout.on('data', d => output += d.toString());
  testProcess.stderr.on('data', d => output += d.toString());

  testProcess.on('close', code => {
    testRunning = false;
    testProcess = null;
    res.end(JSON.stringify({
      success: code === 0,
      exitCode: code,
      testType: testType,
      output: output.slice(-2000) // Last 2000 chars
    }));
  });
}

function stopTest(res) {
  if (!testRunning || !testProcess) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stopped: false, message: 'No test running' }));
    return;
  }

  testProcess.kill('SIGTERM');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ stopped: true }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers for fetch
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (url.pathname === '/run-test') {
    const testType = url.searchParams.get('type') || 'lft';
    const pdfPath = url.searchParams.get('pdf');
    runTest(res, testType, pdfPath);
    return;
  }

  if (url.pathname === '/test-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: testRunning }));
    return;
  }

  if (url.pathname === '/stop-test') {
    stopTest(res);
    return;
  }

  if (url.pathname === '/list-pdfs') {
    // List PDF files in demo/ folder
    const demoDir = path.join(ROOT, 'demo');
    fs.readdir(demoDir, (err, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Could not read demo folder' }));
        return;
      }
      const pdfs = files
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .map(f => 'demo/' + f)
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pdfs }));
    });
    return;
  }

  if (url.pathname === '/save-results' && req.method === 'POST') {
    const filename = url.searchParams.get('file');
    // Only allow saving to test-results/*.json
    if (!filename || !filename.endsWith('.json') || filename.includes('/') || filename.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid filename' }));
      return;
    }
    const filepath = path.join(ROOT, 'test-results', filename);

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // Validate JSON
        const data = JSON.parse(body);
        fs.writeFile(filepath, JSON.stringify(data, null, 2), err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Could not save file' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ saved: true, file: filename }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Static file serving
  let filepath = path.join(ROOT, url.pathname);
  if (url.pathname === '/' || url.pathname.endsWith('/')) {
    filepath = path.join(filepath, 'index.html');
  }

  // Security: prevent directory traversal
  if (!filepath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, filepath);
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}/`);
  console.log(`Test Report: http://localhost:${PORT}/test-results/test-report.html`);
  console.log(`Run SFT: http://localhost:${PORT}/run-test?type=sft`);
  console.log(`Run LFT: http://localhost:${PORT}/run-test?type=lft`);
});
