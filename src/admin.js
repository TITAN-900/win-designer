import './admin.css';
import '../assets/data/projects.js';
import { configured, config, request, login, logout, clearSession, upload, optimizePhoto, externalLink } from './portfolio-api.js';
import { icon, statusMarkup, loginMarkup, dashboardMarkup, projectRowsMarkup, editorMarkup, photosMarkup, changePhoto } from './admin-view.js';

const root = document.querySelector('#admin');
const find = selector => root.querySelector(selector);
let model, rows = [], busy = false, dirty = false, urls = [], screen = 0, filter = 'all';
function notice(message, kind = 'info') {
  const element = find('#notice');
  element.textContent = message;
  element.hidden = !message;
  element.dataset.kind = kind;
}
function confirmAction(message, destructive = false) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmTitle');
    dialog.setAttribute('aria-describedby', 'confirmMessage');
    dialog.innerHTML = `<span class="eyebrow">PLEASE CONFIRM</span><h2 id="confirmTitle">${destructive ? 'Delete this project?' : 'Leave these changes?'}</h2><p id="confirmMessage"></p><div><button type="button" class="btn secondary" data-cancel>Keep editing</button><button type="button" class="btn ${destructive ? 'danger-solid' : 'primary'}" data-confirm>${destructive ? 'Delete project' : 'Discard changes'}</button></div>`;
    dialog.querySelector('p').textContent = message;
    document.body.append(dialog);
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close('cancel');
    dialog.querySelector('[data-confirm]').onclick = () => dialog.close('confirm');
    dialog.addEventListener('close', () => { const accepted = dialog.returnValue === 'confirm'; dialog.remove(); resolve(accepted); }, { once: true });
    dialog.showModal();
    dialog.querySelector('[data-cancel]').focus();
  });
}
function revoke() { urls.forEach(URL.revokeObjectURL); urls = []; }
function markDirty() {
  dirty = true;
  if (find('#saveState')) find('#saveState').textContent = 'Unsaved changes';
}
function shell(content) {
  screen++;
  root.className = 'studio-shell';
  root.innerHTML = `<header class="studio-header"><a class="wordmark" href="/" target="_blank" rel="noopener">WIN JOINERY<span>PORTFOLIO STUDIO</span></a><button id="logout" class="btn quiet">Log out</button></header>${statusMarkup}${content}`;
  find('#logout').onclick = async () => {
    if (busy || (dirty && !await confirmAction('放弃尚未保存的修改并退出？'))) return;
    try { await logout(); showLogin('已退出登录。'); }
    catch { showLogin('本机登录已清除；网络离线，服务器会话撤销尚未确认。'); }
  };
}
function showLogin(message = '') {
  screen++;
  clearSession(); revoke(); dirty = false;
  root.className = 'login-shell';
  root.innerHTML = loginMarkup(configured);
  notice(configured ? message : '尚未连接 Supabase。请按 PORTFOLIO-SETUP.md 配置环境变量、数据库和管理员。暂时无法登录或保存。', configured ? 'info' : 'error');
  find('#login').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button');
    button.disabled = true; button.textContent = 'Signing in…';
    notice('正在安全登录…');
    try { await login(form.username.value, form.password.value); form.password.value = ''; await list(); }
    catch (error) { notice(error.message, 'error'); button.disabled = false; button.innerHTML = `登录 ${icon('arrow')}`; }
  };
}
async function list() {
  rows = await request('/rest/v1/portfolio_projects?order=created_at.desc', { owner: true });
  revoke(); dirty = false; filter = 'all';
  const legacy = window.WIN_DESIGN_DATA.projects.filter(p => !rows.some(r => r.slug === p.slug));
  shell(dashboardMarkup(rows, legacy));
  find('#add').onclick = () => edit({ id: crypto.randomUUID(), slug: 'portfolio-' + crypto.randomUUID(), name: '', description: '', external_link: '', photos: [], cover_id: null, status: 'DRAFT' });
  root.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    filter = button.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    drawList();
  });
  root.querySelectorAll('[data-import]').forEach(button => button.onclick = () => {
    const p = window.WIN_DESIGN_DATA.projects.find(p => p.slug === button.dataset.import);
    const photos = p.gallery.map(im => ({ id: crypto.randomUUID(), src: im.src, width: im.width, height: im.height }));
    edit({ id: crypto.randomUUID(), slug: p.slug, legacy_slug: p.slug, name: p.title, description: p.description || '', external_link: '', photos, cover_id: photos.find((im, i) => p.gallery[i].src === p.cover.src)?.id || photos[0].id, status: 'PUBLISHED' });
    notice('仅在点击保存后接管现有作品。原始图片文件不会被删除。');
  });
  drawList();
}
function drawList() {
  const listScreen = screen;
  find('#list').innerHTML = projectRowsMarkup(rows, filter);
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(structuredClone(rows.find(r => r.id === b.dataset.edit))));
  // Private draft covers use the existing authenticated signed-URL API.
  for (const row of rows) {
    const photo = row.photos.find(p => p.id === row.cover_id) || row.photos[0];
    if (!photo?.path) continue;
    const target = root.querySelector(`[data-cover="${CSS.escape(row.id)}"]`);
    if (!target) continue;
    request(`/storage/v1/object/sign/portfolio/${photo.path}`, { method: 'POST', body: { expiresIn: 3600 }, owner: true }).then(result => {
      if (screen !== listScreen || !target.isConnected) return;
      const img = new Image(); img.alt = row.name; img.loading = 'lazy'; img.src = config.url + '/storage/v1' + result.signedURL;
      target.replaceChildren(img);
    }).catch(() => { if (target.isConnected) target.setAttribute('aria-label', 'Cover unavailable'); });
  }
}
async function edit(value) {
  model = value; dirty = false;
  shell(editorMarkup(model, rows.some(r => r.id === model.id)));
  const editScreen = screen;
  find('#name').value = model.name; find('#description').value = model.description; find('#link').value = model.external_link || '';
  find('#editor').oninput = event => { event.target.removeAttribute('aria-invalid'); markDirty(); };
  find('#editor').addEventListener('invalid', event => event.target.setAttribute('aria-invalid', 'true'), true);
  find('#back').onclick = async () => { if (!busy && (!dirty || await confirmAction('放弃尚未保存的修改？'))) list().catch(e => notice(e.message, 'error')); };
  find('#choosePhotos').onclick = () => find('#files').click();
  find('#files').onchange = async event => {
    const files = [...event.target.files]; event.target.value = '';
    if (!files.length) return;
    if (files.length > 50 || model.photos.length + files.length > 50) return notice('一次及每个作品最多 50 张照片。', 'error');
    setBusy(true);
    const failures = [];
    try {
      for (const [i, file] of files.entries()) {
        transfer(`Preparing ${i + 1} of ${files.length}`, i / files.length * 100);
        try {
          const result = await optimizePhoto(file), id = crypto.randomUUID(), preview = URL.createObjectURL(result.blob);
          urls.push(preview);
          model.photos.push({ id, path: `${model.id}/${id}.jpg`, width: result.width, height: result.height, blob: result.blob, preview });
          model.cover_id ||= id; markDirty(); drawPhotos();
        } catch (error) { failures.push(error.message); }
        transfer(`Prepared ${i + 1} of ${files.length}`, (i + 1) / files.length * 100);
      }
      notice(failures.length ? `部分照片未能读取，请重新选择：\n${failures.join('\n')}\n其余照片已保留，尚未上传。` : '照片已准备，尚未上传。点击 Save Draft 或 Publish 保存。', failures.length ? 'error' : 'success');
    } finally { setBusy(false); }
  };
  find('#editor').onsubmit = async event => { event.preventDefault(); if (!busy) await save(event.submitter?.dataset.status || 'DRAFT'); };
  if (find('#delete')) find('#delete').onclick = deleteProject;
  const dialog = find('#photoPreview');
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  drawPhotos();
  for (const photo of model.photos) {
    if (screen !== editScreen) return;
    if (photo.path && !photo.preview) {
      try { const result = await request(`/storage/v1/object/sign/portfolio/${photo.path}`, { method: 'POST', body: { expiresIn: 3600 }, owner: true }); photo.preview = config.url + '/storage/v1' + result.signedURL; }
      catch (e) { if (screen === editScreen) notice(e.message, 'error'); }
      if (screen === editScreen) drawPhotos();
    }
  }
}
function transfer(label, percent) {
  if (!find('#transfer')) return;
  find('#transfer').hidden = false;
  find('#transferLabel').textContent = label;
  find('#progress').value = percent;
  find('#progressText').textContent = `${Math.round(percent)}%`;
}
function setBusy(value) {
  busy = value;
  root.setAttribute('aria-busy', String(value));
  root.querySelectorAll('button,input,textarea').forEach(el => el.disabled = value);
  if (find('#saveState')) find('#saveState').textContent = value ? 'Please keep this page open…' : dirty ? 'Unsaved changes' : 'Saved project';
  if (find('#photos')) drawPhotos();
}
function drawPhotos() {
  const box = find('#photos'); if (!box) return;
  box.innerHTML = photosMarkup(model.photos, model.cover_id, busy);
  find('#photoCount').textContent = `${model.photos.length} / 50`;
  box.querySelectorAll('button').forEach(button => button.onclick = () => {
    const i = Number(button.dataset.index), action = button.dataset.action;
    if (busy) return;
    if (action === 'preview') {
      const dialog = find('#photoPreview'); dialog.querySelector('img').src = model.photos[i].preview || model.photos[i].src;
      dialog.querySelector('p').textContent = `Photo ${i + 1} of ${model.photos.length}`;
      dialog.showModal(); return;
    }
    changePhoto(model, action, i); markDirty(); drawPhotos();
    const next = Math.min(action === 'up' ? i - 1 : action === 'down' ? i + 1 : i, model.photos.length - 1);
    box.querySelector(`[data-action="${action}"][data-index="${Math.max(0, next)}"]`)?.focus({ preventScroll: true });
  });
}
async function deleteProject() {
  if (busy || !await confirmAction('确定删除此作品及后台上传的照片？此操作无法撤销。', true)) return;
  setBusy(true);
  try {
    if (rows.some(r => r.id === model.id)) await request(`/rest/v1/portfolio_projects?id=eq.${model.id}`, { method: 'PATCH', body: { status: 'DRAFT' }, owner: true });
    const paths = [...new Set([...model.photos, ...(rows.find(r => r.id === model.id)?.photos || [])].map(p => p.path).filter(Boolean))];
    if (paths.length) await request('/storage/v1/object/portfolio', { method: 'DELETE', body: { prefixes: paths }, owner: true });
    await request(`/rest/v1/portfolio_projects?id=eq.${model.id}`, { method: 'DELETE', owner: true });
    await list(); notice('作品已删除。', 'success');
  } catch (e) { notice(`删除未完成，请重试：${e.message}`, 'error'); }
  finally { setBusy(false); }
}
async function save(status) {
  setBusy(true);
  try {
    const name = find('#name').value.trim(), description = find('#description').value.trim();
    if (!name) { find('#name').setAttribute('aria-invalid', 'true'); throw new Error('请填写 Project Name。'); }
    let link;
    try { link = externalLink(find('#link').value); }
    catch (e) { find('#link').setAttribute('aria-invalid', 'true'); throw e; }
    if (status === 'PUBLISHED' && !model.photos.length) throw new Error('发布前至少添加一张照片。');
    const pending = model.photos.filter(p => p.blob && !p.uploaded);
    for (const [i, p] of pending.entries()) {
      notice(`上传 ${i + 1}/${pending.length}；失败时可再次点击保存重试。`);
      await upload(p.path, p.blob, n => transfer(`Uploading ${i + 1} of ${pending.length}`, 100 * (i + n) / pending.length));
      p.uploaded = true;
    }
    if (pending.length) transfer('Photos uploaded · saving project…', 100);
    const photos = model.photos.map(({ id, path, src, width, height }) => ({ id, ...(path ? { path } : { src }), width, height }));
    const payload = { id: model.id, slug: model.slug, legacy_slug: model.legacy_slug || null, name, description, external_link: link, status, cover_id: model.cover_id, photos };
    const old = rows.find(r => r.id === model.id);
    await request('/rest/v1/portfolio_projects?on_conflict=id', { method: 'POST', body: payload, headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, owner: true });
    const removed = (old?.photos || []).map(p => p.path).filter(path => path && !photos.some(p => p.path === path));
    let cleanup = '';
    if (removed.length) try { await request('/storage/v1/object/portfolio', { method: 'DELETE', body: { prefixes: removed }, owner: true }); }
    catch (e) { cleanup = '\n内容已保存，但移除照片的存储清理失败，请在 Supabase Storage 清理孤立文件：' + e.message; }
    await list(); notice((status === 'PUBLISHED' ? '已发布。' : '草稿已保存，不对外公开。') + cleanup, cleanup ? 'error' : 'success');
  } catch (e) { notice(`未完成保存：${e.message}。可重试；不要关闭页面以免丢失待上传照片。`, 'error'); find('#notice')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }
  finally { setBusy(false); }
}
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
showLogin();
