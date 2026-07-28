const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

function waitForServer(url, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      fetch(url).then(resolve).catch(err => {
        if (Date.now() - start > timeoutMs) return reject(err);
        setTimeout(poll, 100);
      });
    })();
  });
}

test('GET /api/health reports keyConfigured:false when no key is set', async () => {
  const port = 8799;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
    stdio: 'ignore'
  });

  try {
    const res = await waitForServer(`http://localhost:${port}/api/health`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.keyConfigured, false);
  } finally {
    child.kill();
  }
});
