const form = document.querySelector('#url-form');
const input = document.querySelector('#url');
const list = document.querySelector('#history');
const toast = document.querySelector('#toast');
const workspace = document.querySelector('#workspace');
const customHost = document.querySelector('#custom-host');
const viewMode = document.querySelector('#view-mode');
const accessBadge = document.querySelector('#access');
const uploadButton = document.querySelector('#upload');
const folderButton = document.querySelector('#folder');
const folderDialog = document.querySelector('#folder-dialog');
const folderForm = document.querySelector('#folder-form');
const folderName = document.querySelector('#folder-name');
const folderCancel = document.querySelector('#folder-cancel');
const objectMenu = document.querySelector('#object-menu');
const deleteUnavailableButton = document.querySelector('#delete-unavailable');
const autoRefreshButton = document.querySelector('#auto-refresh');
const refreshIntervals = [
  { label: 'None', ms: 0 },
  { label: '10 sec', ms: 10_000 },
  { label: '60 sec', ms: 60_000 },
  { label: '10 min', ms: 10 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 }
];
let refreshIntervalIndex = 0;
let refreshTimer;
let canRefreshObjectList = false;
let refreshInFlight = false;

function setAccess(access) {
  const label = { unknown: 'Write access unknown', writable: 'Writable PAR', 'read-only': 'Read-only PAR' }[access] || 'Write access unknown';
  accessBadge.textContent = label; accessBadge.className = `access ${access || 'unknown'}`;
}

function showToast(message, kind = 'error') {
  toast.textContent = message; toast.className = kind + ' visible';
  window.setTimeout(() => { toast.className = ''; }, 5000);
}
function hideObjectMenu() { objectMenu.classList.add('hidden'); }
function showObjectMenu(item, x, y) {
  objectMenu.style.left = `${x}px`; objectMenu.style.top = `${y}px`;
  deleteUnavailableButton.textContent = `Delete ${item.type} unavailable with PAR`;
  objectMenu.classList.remove('hidden');
}
function hostname(url) { try { return new URL(url).hostname; } catch { return url; } }
function renderHistory(items) {
  list.replaceChildren();
  if (!items.length) { list.innerHTML = '<p class="none">No links opened yet.</p>'; return; }
  for (const item of items) {
    const button = document.createElement('button'); button.className = 'history-item';
    button.innerHTML = `<strong>${hostname(item.url)}</strong><span>${new Date(item.openedAt).toLocaleString()}</span>`;
    button.title = item.url;
    button.addEventListener('click', () => { input.value = item.url; form.requestSubmit(); });
    list.append(button);
  }
}
function formatBytes(bytes) {
  if (typeof bytes !== 'number') return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let index = 0; let value = bytes;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}
function formatItemDetails(item) {
  const details = [item.type === 'parent' ? 'Parent folder' : item.type === 'folder' ? 'Folder' : 'Object'];
  if (item.type === 'object') details.push(formatBytes(item.size));
  if (item.storageTier) details.push(item.storageTier);
  if (item.timeCreated) details.push(new Date(item.timeCreated).toLocaleString());
  return details.filter(Boolean).join(' · ');
}
function renderJson(result) {
  canRefreshObjectList = result.kind === 'object-list';
  workspace.replaceChildren(); workspace.className = 'inspector';
  const panel = document.createElement('section'); panel.className = 'inspector-card';
  const heading = document.createElement('h1'); heading.textContent = result.kind === 'object-list' ? 'Object browser' : 'JSON response'; panel.append(heading);
  const description = document.createElement('p'); description.className = 'subtitle';
  description.textContent = result.kind === 'object-list' ? result.folderCount + ' folder' + (result.folderCount === 1 ? '' : 's') + ' · ' + result.objectCount + ' object' + (result.objectCount === 1 ? '' : 's') + ' available through this pre-authenticated request.' : 'Formatted JSON response.';
  panel.append(description);
  if (result.kind === 'object-list') {
    const drop = document.createElement('div'); drop.className = 'drop-zone';
    const dropTitle = document.createElement('strong'); dropTitle.textContent = 'Drop a file here to upload';
    const dropHint = document.createElement('span'); dropHint.textContent = 'OCI will confirm whether this PAR permits writes.';
    drop.append(dropTitle, dropHint);
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', async (event) => { event.preventDefault(); drop.classList.remove('dragging'); const file = event.dataTransfer.files[0]; if (!file) return; if (file.size > 250 * 1024 * 1024) return showToast('Files larger than 250 MB are not supported by this version.'); await uploadFile(file); });
    panel.append(drop);
    const table = document.createElement('div'); table.className = 'object-table';
    for (const item of result.items) {
      const row = document.createElement('div'); row.className = 'object-row ' + item.type;
      const icon = document.createElement('span'); icon.className = 'object-icon ' + item.type; icon.textContent = item.type === 'parent' ? '↩' : item.type === 'folder' ? '▸' : '◆';
      const body = document.createElement('div'); body.className = 'object-body';
      const link = document.createElement('button'); link.className = 'object-link ' + item.type + '-link'; link.textContent = item.name; link.title = item.url || item.name;
      if (item.type === 'object' && item.url) link.addEventListener('click', async () => {
        const result = await window.parBrowser.downloadObject(item.name);
        if (!result.ok) showToast(result.error); else showToast(`Download started for “${item.name}”.`, 'success');
      });
      else if (item.url) link.addEventListener('click', () => { input.value = item.url; form.requestSubmit(); }); else link.disabled = true;
      const details = document.createElement('span'); details.textContent = formatItemDetails(item);
      body.append(link, details); row.append(icon, body); table.append(row);
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); showObjectMenu(item, event.clientX, event.clientY); });
    }
    panel.append(table);
  } else {
    const code = document.createElement('pre'); code.textContent = JSON.stringify(result.data, null, 2); panel.append(code);
  }
  workspace.append(panel);
}
async function reportWrite(result, verb) {
  if (result.cancelled) return;
  setAccess(result.access);
  if (!result.ok) { showToast(result.error); return; }
  showToast(`${verb} “${result.label}”.`, 'success');
}
async function refreshObjectList(showSuccess = false) {
  if (!canRefreshObjectList || viewMode.value !== 'objects' || refreshInFlight) return false;
  refreshInFlight = true;
  try {
    const result = await window.parBrowser.refresh();
    if (!result.ok) { showToast(result.error); return false; }
    renderJson(result);
    if (showSuccess) showToast('Object list refreshed.', 'success');
    return true;
  } finally {
    refreshInFlight = false;
  }
}
function setAutoRefresh(index) {
  refreshIntervalIndex = index;
  const setting = refreshIntervals[index];
  autoRefreshButton.textContent = `Auto-refresh: ${setting.label}`;
  autoRefreshButton.title = setting.ms ? `Refresh the object list every ${setting.label}. Click to change.` : 'Automatic refresh is off. Click to choose an interval.';
  window.clearInterval(refreshTimer);
  refreshTimer = setting.ms ? window.setInterval(() => { refreshObjectList(); }, setting.ms) : undefined;
}
async function uploadFile(file) {
  const result = await window.parBrowser.uploadDropped(file);
  await reportWrite(result, 'Uploaded');
  if (result.ok) await refreshObjectList();
}
async function refreshHistory() { renderHistory(await window.parBrowser.getHistory()); }
async function showObjectBrowser() {
  const result = await window.parBrowser.inspect();
  if (!result.ok) {
    viewMode.value = 'raw';
    showToast(result.error);
    return false;
  }
  renderJson(result);
  return true;
}
async function showRawResponse() {
  await window.parBrowser.showRaw();
  workspace.className = 'hidden';
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await window.parBrowser.open(input.value, customHost.checked);
  if (!result.ok) { showToast(result.error); return; }
  setAccess('unknown'); renderHistory(result.history); viewMode.disabled = false; viewMode.value = 'objects';
  if (await showObjectBrowser()) { showToast('Opened JSON object browser.', 'success'); return; }
  canRefreshObjectList = false; await showRawResponse(); showToast('Opened securely in the viewer.', 'success');
});
document.querySelector('#clear').addEventListener('click', async () => renderHistory(await window.parBrowser.clearHistory()));
viewMode.addEventListener('change', async () => {
  if (viewMode.value === 'objects') await showObjectBrowser();
  else await showRawResponse();
});
uploadButton.addEventListener('click', async () => {
  const result = await window.parBrowser.chooseUpload();
  await reportWrite(result, 'Uploaded');
  if (result.ok) await refreshObjectList();
});
folderButton.addEventListener('click', async () => {
  folderForm.reset(); folderDialog.showModal(); folderName.focus();
});
folderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = folderName.value;
  if (!name.trim()) return;
  folderDialog.close();
  const result = await window.parBrowser.createFolder(name);
  await reportWrite(result, 'Created');
  if (result.ok) await refreshObjectList();
});
folderCancel.addEventListener('click', () => folderDialog.close());
deleteUnavailableButton.addEventListener('click', () => { hideObjectMenu(); showToast('OCI PAR links allow reading and writing objects, but cannot delete them.'); });
document.addEventListener('click', hideObjectMenu);
autoRefreshButton.addEventListener('click', () => setAutoRefresh((refreshIntervalIndex + 1) % refreshIntervals.length));
document.querySelector('#close').addEventListener('click', async () => { await window.parBrowser.close(); canRefreshObjectList = false; setAutoRefresh(0); viewMode.value = 'objects'; viewMode.disabled = true; workspace.className = ''; workspace.innerHTML = '<div class="empty-card"><div class="empty-icon">⌁</div><h1>Open an OCI object</h1><p>Paste a pre-authenticated request URL to browse or download its available content.</p><p class="small">Object-list JSON can be displayed in the Object browser view.</p></div>'; setAccess('unknown'); });
setAutoRefresh(0);
refreshHistory();
