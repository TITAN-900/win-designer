export const config = { url: import.meta.env?.VITE_SUPABASE_URL || '', key: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || '' };
// Publishable keys identify the app; only the signed-in user's JWT is a bearer token.
export function authHeaders(key, accessToken = '') {
  return { apikey: key, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
}
export const configured = Boolean(config.url && config.key && !config.url.includes('YOUR_PROJECT'));
let token = '';
export function clearSession() { token = ''; }
export async function request(path, { method = 'GET', body, headers = {}, owner = false } = {}) {
  if (!configured) throw new Error('Supabase 尚未配置，无法连接或保存。');
  if (owner && !token) throw new Error('请先登录管理员账号。');
  const response = await fetch(config.url + path, { method, headers: {
    ...authHeaders(config.key, token),
    ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers
  }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(result?.msg || result?.message || result?.error_description || result?.error || `请求失败 (${response.status})`);
  }
  return result;
}
export async function login(username, password) {
  clearSession();
  const response = await fetch('/api/portfolio-login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}), signal:AbortSignal.timeout(40000) });
  const data = await response.json().catch(()=>null);
  if(!response.ok || !data?.access_token) throw new Error(data?.message || '登录失败，请稍后重试。');
  token = data.access_token;
  try { if (!await request('/rest/v1/rpc/portfolio_is_admin', { method: 'POST', body: {}, owner: true })) throw new Error('此账号没有管理权限。'); }
  catch (error) { clearSession(); throw error; }
}
export async function logout() {
  try { await request('/auth/v1/logout', { method: 'POST', owner: true }); }
  finally { clearSession(); }
}
export function externalLink(value) {
  if (!value?.trim()) return '';
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('链接必须是 http:// 或 https://，且不能包含账号密码。');
  return url.href;
}
export const imageUrl = photo => photo.src || `/api/portfolio-image?path=${encodeURIComponent(photo.path)}`;
export async function upload(path, blob, progress) {
  if (!token) throw new Error('登录已失效，请重新登录。');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${config.url}/storage/v1/object/portfolio/${path}`);
    xhr.setRequestHeader('apikey', config.key); xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', blob.type); xhr.setRequestHeader('x-upsert', 'true');
    xhr.timeout = 90000;
    xhr.upload.onprogress = event => progress(event.lengthComputable ? event.loaded / event.total : 0);
    xhr.onerror = () => reject(new Error('网络中断，照片尚未上传；请重试保存。'));
    xhr.ontimeout = () => reject(new Error('上传超时，请重试保存。'));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`照片上传失败 (${xhr.status})，请检查登录及 Storage 权限后重试。`));
    xhr.send(blob);
  });
}
export async function optimizePhoto(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 超过 25MB。`);
  if (!/image\/(jpeg|png|webp|heic|heif)/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('只允许 JPEG、PNG、WebP 或可由浏览器解码的 HEIC 照片。');
  const url = URL.createObjectURL(file), img = new Image();
  try {
    img.src = url; await img.decode();
    const ratio = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio); canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('优化后照片仍超过 8MB，请选择较小的照片。');
    return { blob, width: canvas.width, height: canvas.height };
  } catch(error) { throw new Error(`${file.name}: ${error.message}。如为 HEIC，请在手机导出为 JPEG 后重试。`); }
  finally { URL.revokeObjectURL(url); }
}
