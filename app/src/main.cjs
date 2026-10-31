'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const projectRoot = path.resolve(__dirname, '..');
function findHome() {
  if (process.env.CHARACTER_ATELIER_HOME) return path.resolve(process.env.CHARACTER_ATELIER_HOME);
  let folder = projectRoot;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(folder, 'artifacts', 'assets', 'manifest.json'))) return folder;
    const parent = path.dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  throw new Error('Character assets are missing. Run the documented asset preparation first.');
}
const home = findHome();
const outputs = path.join(home, 'exports');
const verification = process.argv.includes('--verify') || process.argv.includes('--verify-smoke');
const verifyRoot = process.env.CHARACTER_ATELIER_VERIFY_DIR || path.join(home, 'artifacts', 'verification');
const assetsRoot = path.join(home, 'artifacts', 'assets');
const vendorRoot = path.join(home, 'tooling', 'node_modules', 'three');
const ffmpeg = process.env.CHARACTER_ATELIER_FFMPEG || (fs.existsSync(path.join(home, 'tooling', 'ffmpeg.exe')) ? path.join(home, 'tooling', 'ffmpeg.exe') : 'D:\\ffmpeg-8.0-essentials_build\\bin\\ffmpeg.exe');
fs.mkdirSync(outputs, { recursive: true });
fs.mkdirSync(verifyRoot, { recursive: true });
app.setPath('userData', path.join(home, 'user-data'));
let window, server, origin, video = null;
const allowedOutputs = new Set();
const mime = { '.js': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.thumb':'image/png' };
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Character Atelier</title><script type="importmap" nonce="atelier">{"imports":{"three":"/vendor/build/three.module.js","three/addons/":"/vendor/examples/jsm/"}}</script></head><body><div id="app"></div><script type="module" src="/src/app.js"></script></body></html>`;

function safeFilename(name, extension) {
  return String(name || 'character').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 70) || 'character';
}
async function destination(kind, name) {
  const extension = { image: 'png', model: 'glb', video: 'mp4', character: 'atelier' }[kind];
  if (!extension) throw new Error('Unsupported output format.');
  const filename = `${safeFilename(name)}.${extension}`;
  if (verification) return path.join(verifyRoot, filename);
  const result = await dialog.showSaveDialog(window, {
    title: `Save ${kind}`, defaultPath: path.join(outputs, filename),
    filters: [{ name: kind === 'model' ? 'glTF binary model' : kind, extensions: [extension] }]
  });
  return result.canceled ? null : result.filePath;
}
function bytes(value, max = 256 * 1024 * 1024) {
  const buffer = Buffer.from(value);
  if (!buffer.length || buffer.length > max) throw new Error('Invalid output size.');
  return buffer;
}
async function atomicWrite(filename, data) {
  const temp = filename + '.' + crypto.randomUUID() + '.partial';
  await fsp.writeFile(temp, data, { flag: 'wx' });
  await fsp.rename(temp, filename);
  allowedOutputs.add(filename);
  return filename;
}
function handler(name, action) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!origin || !event.senderFrame?.url.startsWith(origin + '/')) throw new Error('Invalid application origin.');
    return action(...args);
  });
}

async function readCharacter(target) {
  if ((await fsp.stat(target)).size > 32 * 1024 * 1024) throw new Error('Character file is too large.');
  return JSON.parse(await fsp.readFile(target, 'utf8'));
}
handler('environment', async () => {
  const index = process.argv.indexOf('--open');
  const initialCharacter = index >= 0 && process.argv[index + 1] ? await readCharacter(path.resolve(process.argv[index + 1])) : null;
  return { verification, videoAvailable: fs.existsSync(ffmpeg), outputs, version: '0.1.0', initialCharacter };
});
handler('save-character', async data => {
  if (!data || data.schema !== 'character-atelier/v1') throw new Error('Unsupported character data.');
  const serialized = Buffer.from(JSON.stringify(data, null, 2));
  if (serialized.length > 32 * 1024 * 1024) throw new Error('Character file is too large.');
  const target = await destination('character', data.name);
  return target ? atomicWrite(target, serialized) : null;
});
handler('open-character', async () => {
  const selection = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Character Atelier', extensions: ['atelier', 'json'] }] });
  if (selection.canceled) return null;
  const target = selection.filePaths[0];
  return readCharacter(target);
});
handler('import-tattoo', async () => {
  const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Tattoo image', extensions: ['png', 'jpg', 'jpeg'] }] });
  if (result.canceled) return null;
  const buffer = await fsp.readFile(result.filePaths[0]);
  if (buffer.length > 6 * 1024 * 1024) throw new Error('Use an image smaller than 6 MB.');
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (!png && !jpeg) throw new Error('Use a PNG or JPEG image.');
  return `data:image/${png ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`;
});
handler('save-output', async ({ kind, bytes: content, name }) => {
  if (!['image', 'model'].includes(kind)) throw new Error('Unsupported output.');
  const buffer = bytes(content);
  if (kind === 'model' && buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB output.');
  if (kind === 'image' && !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG output.');
  const target = await destination(kind, name);
  return target ? atomicWrite(target, buffer) : null;
});
handler('reveal-output', filename => {
  if (allowedOutputs.has(filename)) shell.showItemInFolder(filename);
});
handler('video-start', async options => {
  if (video) throw new Error('Another video is already being rendered.');
  if (!fs.existsSync(ffmpeg)) throw new Error('FFmpeg is not available.');
  if (![24, 30].includes(options.fps) || ![720, 1080].includes(options.height)) throw new Error('Unsupported video settings.');
  const target = await destination('video', options.name);
  if (!target) return false;
  const temp = path.join(path.dirname(target), '.' + crypto.randomUUID() + '.mp4');
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(options.fps), '-f', 'image2pipe', '-vcodec', 'png', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temp], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  const job = { child, target, temp, error: '', frames: 0 };
  child.stderr.on('data', chunk => { job.error = (job.error + chunk.toString()).slice(-4000); });
  job.closed = new Promise(resolve => { child.once('error', error => resolve({ code: -1, message: error.message })); child.once('close', code => resolve({ code, message: job.error })); });
  child.stdin.on('error', error => { job.error = error.message; });
  video = job;
  return true;
});
handler('video-frame', async frame => {
  if (!video || video.frames >= 1800 || video.child.stdin.destroyed) throw new Error('Video writer is not ready.');
  const buffer = bytes(frame, 64 * 1024 * 1024);
  await new Promise((resolve, reject) => video.child.stdin.write(buffer, error => error ? reject(error) : resolve()));
  video.frames++;
  return video.frames;
});
handler('video-finish', async () => {
  if (!video) throw new Error('No active video.');
  const job = video;
  job.child.stdin.end();
  const result = await job.closed;
  video = null;
  if (result.code !== 0 || !job.frames) {
    await fsp.rm(job.temp, { force: true });
    throw new Error(result.message || 'Video rendering failed.');
  }
  await fsp.rename(job.temp, job.target);
  allowedOutputs.add(job.target);
  return job.target;
});
handler('video-cancel', async () => {
  if (!video) return;
  const job = video;
  video = null;
  job.child.kill();
  await job.closed;
  await fsp.rm(job.temp, { force: true });
});

async function startServer() {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (request.method !== 'GET') { response.writeHead(405).end(); return; }
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'nonce-atelier'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'");
      if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
      let base, relative;
      if (pathname.startsWith('/assets/')) { base = assetsRoot; relative = pathname.slice(8); }
      else if (pathname.startsWith('/vendor/')) { base = vendorRoot; relative = pathname.slice(8); }
      else if (pathname.startsWith('/src/')) { base = path.join(projectRoot, 'src'); relative = pathname.slice(5); }
      else { response.writeHead(404).end(); return; }
      const target = path.resolve(base, relative);
      if (!target.startsWith(path.resolve(base) + path.sep) || !(await fsp.stat(target)).isFile()) { response.writeHead(403).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-cache');
      const stream = fs.createReadStream(target);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
}

app.whenReady().then(async () => {
  await startServer();
  window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1120, minHeight: 760,
    backgroundColor: '#171b20', title: 'Character Atelier', show: !verification,
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
  window.webContents.on('console-message', event => {
    fs.appendFileSync(path.join(verifyRoot, 'console.log'), JSON.stringify({level:event.level,message:event.message,line:event.lineNumber}) + '\n');
  });
  await window.loadURL(origin);
  if (verification) {
    window.showInactive();
    try {
      const deadline = Date.now() + 120000;
      while (!await window.webContents.executeJavaScript('Boolean(window.atelier?.ready)')) {
        if (Date.now() > deadline) throw new Error('Editor readiness timed out.');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const report = await window.webContents.executeJavaScript(`window.atelier.verify(${process.argv.includes('--verify-smoke')})`);
      await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await new Promise(resolve => setTimeout(resolve, 400));
      const screenshot = await window.webContents.capturePage();
      await fsp.writeFile(path.join(verifyRoot, 'application.png'), screenshot.toPNG());
      await fsp.writeFile(path.join(verifyRoot, 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      app.exit(report.ok ? 0 : 1);
    } catch (error) {
      await fsp.writeFile(path.join(verifyRoot, 'failure.txt'), error.stack || String(error));
      const screenshot = await window.webContents.capturePage();
      await fsp.writeFile(path.join(verifyRoot, 'failure.png'), screenshot.toPNG());
      console.error(error);
      app.exit(1);
    }
  }
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (video) video.child.kill(); server?.close(); });
