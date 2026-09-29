const { app, BrowserWindow, BrowserView, dialog, ipcMain, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let windowRef;
let contentView;
let history = [];
let currentUrl = '';

const HISTORY_FILE = () => path.join(app.getPath('userData'), 'recent-par-links.json');

function loadHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE(), 'utf8'));
    history = Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch { history = []; }
}

function saveHistory() {
  fs.writeFileSync(HISTORY_FILE(), JSON.stringify(history.slice(0, 12), null, 2), { mode: 0o600 });
}

function validateParUrl(raw, allowCustomHost) {
  let url;
  try { url = new URL(raw.trim()); } catch { return { ok: false, error: 'Enter a complete URL.' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'Only HTTPS links can be opened.' };

  const ociHost = /(^|\.)objectstorage\.[a-z0-9-]+\.oraclecloud\.com$/i.test(url.hostname)
    || /(^|\.)objectstorage\.[a-z0-9-]+\.oci\.oraclecloud\.com$/i.test(url.hostname);
  const looksLikePar = /\/p\//.test(url.pathname) || /\/n\//.test(url.pathname);
  if (!allowCustomHost && !ociHost) return { ok: false, error: 'This is not a recognized OCI Object Storage host.' };
  if (!allowCustomHost && !looksLikePar) return { ok: false, error: 'This does not look like an OCI pre-authenticated request URL.' };
  return { ok: true, url: url.toString(), host: url.hostname };
}

function resizeView() {
  if (!windowRef || !contentView) return;
  const [width, height] = windowRef.getContentSize();
  contentView.setBounds({ x: 292, y: 82, width: Math.max(0, width - 292), height: Math.max(0, height - 82) });
  contentView.setAutoResize({ width: true, height: true });
}

function toObjectUrl(sourceUrl, name) {
  const source = new URL(sourceUrl);
  const objectRoot = source.pathname.indexOf('/o/');
  if (objectRoot < 0 || !source.pathname.slice(objectRoot + 3).match(/^$/)) return null;
  source.pathname = `${source.pathname.slice(0, objectRoot + 3)}${name.split('/').map(encodeURIComponent).join('/')}`;
  source.search = '';
  return source.toString();
}

function toFolderUrl(sourceUrl, prefix) {
  const source = new URL(sourceUrl);
  const objectRoot = source.pathname.indexOf('/o/');
  if (objectRoot < 0 || source.pathname.slice(objectRoot + 3) !== '') return null;
  if (prefix) source.searchParams.set('prefix', prefix);
  else source.searchParams.delete('prefix');
  source.searchParams.set('delimiter', '/');
  source.searchParams.delete('start');
  return source.toString();
}

function toParentFolderUrl(sourceUrl) {
  const source = new URL(sourceUrl);
  const prefix = source.searchParams.get('prefix') || '';
  if (!prefix) return null;
  const parts = prefix.replace(/\/+$/, '').split('/').filter(Boolean);
  parts.pop();
  return toFolderUrl(sourceUrl, parts.length ? `${parts.join('/')}/` : '');
}

function toCollectionUrl(raw) {
  const source = new URL(raw);
  const objectRoot = source.pathname.indexOf('/o/');
  if (objectRoot >= 0 && source.pathname.slice(objectRoot + 3) === '') {
    source.searchParams.set('delimiter', '/');
    source.searchParams.delete('start');
  }
  return source.toString();
}

function inspectJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'This response is not valid JSON.' }; }
  const sourceObjects = Array.isArray(data.objects) ? data.objects : [];
  const prefixes = Array.isArray(data.prefixes) ? data.prefixes : [];
  const currentPrefix = new URL(currentUrl).searchParams.get('prefix') || '';
  const folders = new Map();
  for (const prefix of prefixes) {
    const name = String(prefix);
    folders.set(name, { name, type: 'folder', url: toFolderUrl(currentUrl, name) });
  }
  const objects = [];
  for (const object of sourceObjects) {
    const name = String(object.name || '(unnamed object)');
    if (name.endsWith('/')) {
      // OCI represents a folder with an optional zero-byte "folder marker" object.
      // When listing inside that folder, its marker is returned as an object too;
      // it is the current directory, not a child the user can enter.
      if (name === currentPrefix) continue;
      folders.set(name, { name, type: 'folder', url: toFolderUrl(currentUrl, name), size: object.size, timeCreated: object.timeCreated });
    } else {
      objects.push({ name, type: 'object', size: object.size, etag: object.etag, timeCreated: object.timeCreated, storageTier: object.storageTier, url: object.name ? toObjectUrl(currentUrl, name) : null });
    }
  }
  const parentUrl = toParentFolderUrl(currentUrl);
  const parent = parentUrl ? [{ name: '(..) Go back', type: 'parent', url: parentUrl }] : [];
  const items = parent.concat([...folders.values()].sort((a, b) => a.name.localeCompare(b.name)), objects.sort((a, b) => a.name.localeCompare(b.name)));
  return { ok: true, kind: items.length || Array.isArray(data.objects) || Array.isArray(data.prefixes) ? 'object-list' : 'json', items, folderCount: folders.size, objectCount: objects.length, data };
}

function destinationFor(name) {
  const parsed = new URL(currentUrl);
  const marker = parsed.pathname.indexOf('/o/');
  if (marker < 0) return { ok: false, error: 'This PAR does not have an Object Storage object path.' };
  const existingObject = parsed.pathname.slice(marker + 3);
  if (existingObject) return { ok: true, url: parsed.toString(), label: decodeURIComponent(existingObject), exact: true };
  const prefix = parsed.searchParams.get('prefix') || '';
  const objectName = `${prefix}${name}`;
  parsed.pathname += objectName.split('/').map(encodeURIComponent).join('/');
  parsed.search = '';
  return { ok: true, url: parsed.toString(), label: objectName, exact: false };
}

async function putObject(name, bytes, contentType = 'application/octet-stream') {
  if (!currentUrl) return { ok: false, access: 'unknown', error: 'Open a PAR before uploading.' };
  const destination = destinationFor(name);
  if (!destination.ok) return { ok: false, access: 'unknown', error: destination.error };
  try {
    const response = await net.fetch(destination.url, { method: 'PUT', headers: { 'content-type': contentType }, body: bytes });
    if (response.ok) return { ok: true, access: 'writable', label: destination.label, exact: destination.exact };
    const access = [401, 403].includes(response.status) ? 'read-only' : 'unknown';
    const message = access === 'read-only'
      ? 'OCI rejected the write. This PAR is read-only, expired, or no longer valid.'
      : `OCI could not write this object (HTTP ${response.status}).`;
    return { ok: false, access, error: message };
  } catch (error) { return { ok: false, access: 'unknown', error: `The upload could not be sent: ${error.message}` }; }
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1280, height: 800, minWidth: 850, minHeight: 550,
    backgroundColor: '#0b1220',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  windowRef.loadFile(path.join(__dirname, 'index.html'));
  windowRef.on('resize', resizeView);
  windowRef.on('closed', () => { windowRef = null; contentView = null; });
}

async function openInView(raw, allowCustomHost) {
  const check = validateParUrl(raw, allowCustomHost);
  if (!check.ok) return check;
  if (!contentView) {
    contentView = new BrowserView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
    windowRef.setBrowserView(contentView);
    contentView.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    contentView.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('https:')) { event.preventDefault(); shell.openExternal(url); }
    });
  }
  windowRef.setBrowserView(contentView);
  resizeView();
  const collectionUrl = toCollectionUrl(check.url);
  try {
    await contentView.webContents.loadURL(collectionUrl);
    currentUrl = collectionUrl;
    const item = { url: collectionUrl, host: check.host, openedAt: new Date().toISOString() };
    history = [item, ...history.filter((entry) => entry.url !== item.url)].slice(0, 12);
    saveHistory();
    return { ok: true, item, history };
  } catch (error) {
    return { ok: false, error: `The link could not be loaded: ${error.message}` };
  }
}

app.whenReady().then(() => { loadHistory(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('history:get', () => history);
ipcMain.handle('history:clear', () => { history = []; saveHistory(); return history; });
ipcMain.handle('par:open', (_, raw, allowCustomHost) => openInView(raw, allowCustomHost));
ipcMain.handle('par:close', () => { if (contentView) { windowRef.removeBrowserView(contentView); contentView = null; } return true; });
ipcMain.handle('par:inspect', async () => {
  if (!contentView) return { ok: false, error: 'Open a response before inspecting it.' };
  const text = await contentView.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
  const result = inspectJson(text);
  if (result.ok) windowRef.removeBrowserView(contentView);
  return result;
});
ipcMain.handle('par:refresh', async () => {
  if (!contentView || !currentUrl) return { ok: false, error: 'Open a response before refreshing it.' };
  try {
    await contentView.webContents.loadURL(currentUrl);
    const text = await contentView.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true);
    const result = inspectJson(text);
    if (result.ok) windowRef.removeBrowserView(contentView);
    return result;
  } catch (error) {
    return { ok: false, error: `The response could not be refreshed: ${error.message}` };
  }
});
ipcMain.handle('par:showRaw', () => { if (contentView) { windowRef.setBrowserView(contentView); resizeView(); } return true; });
ipcMain.handle('par:chooseUpload', async () => {
  const selection = await dialog.showOpenDialog(windowRef, { title: 'Choose a file to upload', properties: ['openFile'] });
  if (selection.canceled) return { ok: false, cancelled: true };
  const filePath = selection.filePaths[0];
  const stat = fs.statSync(filePath);
  if (stat.size > 250 * 1024 * 1024) return { ok: false, access: 'unknown', error: 'Files larger than 250 MB are not supported by this version.' };
  return putObject(path.basename(filePath), fs.readFileSync(filePath));
});
ipcMain.handle('par:uploadDropped', (_, name, type, bytes) => putObject(name, Buffer.from(bytes), type || 'application/octet-stream'));
ipcMain.handle('par:downloadObject', (_, name) => {
  if (!contentView || !currentUrl) return { ok: false, error: 'Open an object list before downloading.' };
  const objectUrl = toObjectUrl(currentUrl, String(name || ''));
  if (!objectUrl) return { ok: false, error: 'This object cannot be downloaded from the current PAR.' };
  contentView.webContents.downloadURL(objectUrl);
  return { ok: true, label: name };
});
ipcMain.handle('par:createFolder', (_, name) => {
  const folder = String(name || '').trim();
  if (!folder) return { ok: false, access: 'unknown', error: 'Enter a folder name.' };
  if (folder.startsWith('/') || folder.endsWith('/') || folder.split('/').some((part) => !part || part === '.' || part === '..')) {
    return { ok: false, access: 'unknown', error: 'Use a relative folder path such as a/b/c, with no empty, . or .. segments.' };
  }
  return putObject(`${folder}/`, Buffer.alloc(0), 'application/x-directory');
});
