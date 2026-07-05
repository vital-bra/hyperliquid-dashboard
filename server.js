const http = require('http');
const fs = require('fs');
const path = require('path');
const { isAddress } = require('./src/services/rpcClient');
const { scanProjectX } = require('./src/adapters/projectX');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data, null, 2));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJson(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css' : 'application/javascript';
    res.writeHead(200, { 'content-type': type });
    res.end(content);
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, app: 'LP Scanner Pro', version: '2.1.0', time: new Date().toISOString() });
    return;
  }

  if (url.pathname === '/api/scan') {
    const wallet = (url.searchParams.get('wallet') || '').trim();
    if (!isAddress(wallet)) {
      sendJson(res, 400, { ok: false, error: 'Wallet non valido. Inserisci un indirizzo EVM 0x di 42 caratteri.' });
      return;
    }

    const projectX = await scanProjectX(wallet);
    sendJson(res, 200, {
      ok: true,
      wallet,
      version: '2.1.0',
      scannedAt: new Date().toISOString(),
      totals: {
        lpValueUsd: 0,
        pools: projectX.pools.length,
        dex: projectX.status === 'rpc-connected' ? 1 : 0,
        rewardsUsd: 0
      },
      adapters: [projectX],
      message: projectX.status === 'rpc-connected'
        ? 'Backend attivo. RPC raggiungibile. Serve completare il mapping contratti Project X per leggere LP/reward reali.'
        : 'Backend attivo, ma RPC HyperEVM non raggiungibile da questo ambiente. Controlla /api/scan su Render.'
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendJson(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }
    sendFile(res, filePath);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message || String(err) });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`LP Scanner Pro running on port ${PORT}`));
}

module.exports = { server };
