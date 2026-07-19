/** Z07 transport only; ark-mcp-runtime owns every hook decision. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const RESIDENT_HOOK_PROTOCOL_VERSION = 1;

export function residentHookEndpoint({ root, config, manifest, tsconfig, launcher }) {
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch { realRoot = path.resolve(root); }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
  const directory = path.join(os.tmpdir(), `arkgate-${uid}`);
  const digest = createHash('sha256').update(JSON.stringify({
    root: realRoot,
    config: path.resolve(root, config),
    manifest: manifest ? path.resolve(root, manifest) : null,
    tsconfig: tsconfig ? path.resolve(root, tsconfig) : null,
    launcher: path.resolve(launcher),
    executable: process.execPath,
  })).digest('hex').slice(0, 24);
  return {
    directory,
    socket: process.platform === 'win32'
      ? `\\\\.\\pipe\\arkgate-z07-${uid}-${digest}`
      : path.join(directory, `${digest}.sock`),
  };
}

export function residentEnvironmentIdentity(paths, tokens = []) {
  const hash = createHash('sha256');
  for (const token of [...tokens].map(String).sort()) hash.update('token\0').update(token).update('\0');
  for (const file of [...new Set(paths.map((entry) => path.resolve(entry)))].sort()) {
    hash.update('path\0').update(file).update('\0');
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) hash.update('link\0').update(fs.readlinkSync(file));
      else if (stat.isFile()) hash.update('file\0').update(fs.readFileSync(file));
      else hash.update('other\0');
    } catch { hash.update('missing\0'); }
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function requestResidentHook({ socket, request, timeoutMs = 75 }) {
  return new Promise((resolve) => {
    let done = false;
    let buffered = '';
    const client = net.createConnection(socket);
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    client.setEncoding('utf8');
    client.once('connect', () => client.write(`${JSON.stringify(request)}\n`));
    client.on('data', (chunk) => {
      buffered += chunk;
      if (buffered.length > 24 * 1024 * 1024) return finish(null);
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      try {
        const parsed = JSON.parse(buffered.slice(0, newline));
        finish(parsed?.protocolVersion === RESIDENT_HOOK_PROTOCOL_VERSION ? parsed : null);
      } catch { finish(null); }
    });
    client.once('error', () => finish(null));
    client.once('end', () => finish(null));
  });
}

function secureDirectory(directory) {
  if (process.platform === 'win32') return true;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return false;
    fs.chmodSync(directory, 0o700);
    return true;
  } catch { return false; }
}

export async function startResidentHookServer({ endpoint, handle }) {
  if (!secureDirectory(endpoint.directory)) return null;
  const server = net.createServer((client) => {
    client.setEncoding('utf8');
    let buffered = '';
    let handled = false;
    client.on('data', async (chunk) => {
      if (handled) return;
      buffered += chunk;
      if (buffered.length > 12 * 1024 * 1024) return client.destroy();
      const newline = buffered.indexOf('\n');
      if (newline < 0) return;
      handled = true;
      let response;
      try { response = await handle(JSON.parse(buffered.slice(0, newline))); }
      catch { response = { protocolVersion: RESIDENT_HOOK_PROTOCOL_VERSION, fallback: true }; }
      if (!client.destroyed) client.end(`${JSON.stringify(response)}\n`);
    });
  });
  const listening = await new Promise((resolve) => {
    const failed = () => resolve(false);
    server.once('error', failed);
    server.listen(endpoint.socket, () => {
      server.off('error', failed);
      resolve(true);
    });
  });
  if (!listening) {
    try { server.close(); } catch { /* The endpoint is already owned. */ }
    return null;
  }
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { server.close(); } catch { /* Already closed. */ }
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(endpoint.socket); } catch { /* Exact endpoint already absent. */ }
    }
  };
  return { cleanup };
}
