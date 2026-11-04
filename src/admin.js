import './admin.css';
import '../assets/data/projects.js';
import { configured, config, request, login, logout, clearSession, upload, optimizePhoto, externalLink } from './portfolio-api.js';
import { escapeHTML as esc } from './project-content.js';
const root = document.querySelector('#admin');
let model, rows = [], busy = false, dirty = false, urls = [];
const notice = message => {
  const element = document.querySelector('#notice');
  element.textContent = message;
  // Keep status in normal flow so it cannot obscure the project-name field.
  element.style.position = 'static';
  if (busy) element.scrollIntoView({block:'nearest'});
};
function revoke() { urls.forEach(URL.revokeObjectURL); urls = []; }
function shell(content) { root.innerHTML = `<header><h1>WIN JOINERY / Portfolio</h1><button id="logout">退出登录</button></header><p id="notice" class="notice" role="status" aria-live="polite"></p>${content}`; document.querySelector('#logout').onclick = async () => { if(busy)return; if(dirty&&!confirm('放弃尚未保存的修改并退出？'))return; try {await logout();showLogin('已退出登录。');}catch {showLogin('本机登录已清除；网络离线，服务器会话撤销尚未确认。');} }; }
function showLogin(message = '') {
  clearSession(); revoke(); dirty=false;
  root.innerHTML = `<h1>WIN JOINERY</h1><h2>Portfolio 管理登录</h2><p id="notice" role="status" class="notice"></p><form id="login"><label>Username<input name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="48" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button ${!configured?'disabled':''}>登录</button></form><a href="/">返回网站</a>`;
  notice(configured ? message : '尚未连接 Supabase。请按 PORTFOLIO-SETUP.md 配置环境变量、数据库和管理员。此页面不能假装登录或保存成功。');
  document.querySelector('form').onsubmit = async event => {event.preventDefault();const form=event.currentTarget;form.querySelector('button').disabled=true;try {await login(form.username.value,form.password.value);form.password.value='';await list();}catch(error){notice(error.message);form.querySelector('button').disabled=false;}};
}
async function list() {
  rows=await request('/rest/v1/portfolio_projects?order=created_at.desc',{owner:true}); revoke();dirty=false;
  shell(`<h2>Manage Portfolio</h2><button id="add">Add New Portfolio</button><div id="list">${rows.map(p=>`<article class="row"><h3>${esc(p.name)}</h3><p>${p.status} · ${p.photos.length} photos</p><button data-edit="${p.id}">编辑</button></article>`).join('')||'<p>后台暂时没有作品。</p>'}</div><h2>现有网站作品</h2><p>现有内容继续保留。接管后可在这里编辑；取消发布或删除接管作品后，公开网站也会移除其入口，原始图片文件不会删除。</p>${window.WIN_DESIGN_DATA.projects.filter(p=>!rows.some(r=>r.slug===p.slug)).map(p=>`<button data-import="${p.slug}">接管 ${esc(p.title)}</button>`).join('')}`);
  document.querySelector('#add').onclick=()=>edit({id:crypto.randomUUID(),slug:'portfolio-'+crypto.randomUUID(),name:'',description:'',external_link:'',photos:[],cover_id:null,status:'DRAFT'});
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(structuredClone(rows.find(r=>r.id===b.dataset.edit))));
  root.querySelectorAll('[data-import]').forEach(b=>b.onclick=()=>{const p=window.WIN_DESIGN_DATA.projects.find(p=>p.slug===b.dataset.import);const photos=p.gallery.map((im,i)=>({id:crypto.randomUUID(),src:im.src,width:im.width,height:im.height}));edit({id:crypto.randomUUID(),slug:p.slug,legacy_slug:p.slug,name:p.title,description:p.description||'',external_link:'',photos,cover_id:photos.find((im,i)=>p.gallery[i].src===p.cover.src)?.id||photos[0].id,status:'PUBLISHED'});notice('仅在点击保存/发布后接管现有作品。原始文件不会被删除。');});
}
async function edit(value) {
  model=value;dirty=false;
  shell(`<button id="back">返回作品列表</button><form id="editor"><label>Project Name<input id="name" maxlength="160" required></label><label>Description<textarea id="description" maxlength="4000"></textarea></label><label>External Link（可选）<input id="link" type="url" placeholder="https://"></label><label>照片（每次及总计最多 50 张）<input id="files" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple></label><p>顺序就是公开图库顺序。选择封面后会显示“封面”。</p><progress id="progress" max="100" value="0"></progress><div id="photos" class="photos"></div><div class="actions"><button type="submit" data-status="DRAFT">Save Draft / 取消发布</button><button type="submit" data-status="PUBLISHED">Publish / 保存已发布</button><button type="button" id="delete">删除作品</button></div></form>`);
  document.querySelector('#name').value=model.name;document.querySelector('#description').value=model.description;document.querySelector('#link').value=model.external_link||'';
  document.querySelector('#editor').oninput=()=>dirty=true;
  document.querySelector('#back').onclick=()=>{if(!dirty||confirm('放弃尚未保存的修改？'))list().catch(e=>notice(e.message));};
  document.querySelector('#files').onchange=async event=>{
    const files=[...event.target.files];event.target.value='';
    if(files.length>50||model.photos.length+files.length>50)return notice('一次及每个作品最多 50 张照片。');
    setBusy(true);
    try{for(const [i,file] of files.entries()){notice(`优化照片 ${i+1}/${files.length}：${file.name}`);const result=await optimizePhoto(file);const id=crypto.randomUUID(), preview=URL.createObjectURL(result.blob);urls.push(preview);model.photos.push({id,path:`${model.id}/${id}.jpg`,width:result.width,height:result.height,blob:result.blob,preview});model.cover_id ||= id;dirty=true;drawPhotos();}notice('照片已准备，尚未上传。点击 Save Draft 或 Publish 保存。');}catch(e){notice(e.message);}finally{setBusy(false);}
  };
  document.querySelector('#editor').onsubmit=async event=>{event.preventDefault();await save(event.submitter.dataset.status);};
  document.querySelector('#delete').onclick=async()=>{
    if(!confirm('确定删除此作品及后台上传的照片？此操作无法撤销。'))return;
    setBusy(true);try{
      // Hide first, then clean storage; failures are retryable without exposing partial state.
      if(rows.some(r=>r.id===model.id))await request(`/rest/v1/portfolio_projects?id=eq.${model.id}`,{method:'PATCH',body:{status:'DRAFT'},owner:true});
      const paths=[...new Set([...model.photos,...(rows.find(r=>r.id===model.id)?.photos||[])].map(p=>p.path).filter(Boolean))];
      if(paths.length)await request('/storage/v1/object/portfolio',{method:'DELETE',body:{prefixes:paths},owner:true});
      await request(`/rest/v1/portfolio_projects?id=eq.${model.id}`,{method:'DELETE',owner:true});await list();notice('作品已删除。');
    }catch(e){notice(`删除未完成，请重试：${e.message}`);}finally{setBusy(false);}
  };
  drawPhotos();
  for(const photo of model.photos){if(photo.path&&!photo.preview){try{const result=await request(`/storage/v1/object/sign/portfolio/${photo.path}`,{method:'POST',body:{expiresIn:3600},owner:true});photo.preview=config.url+'/storage/v1'+result.signedURL;}catch(e){notice(e.message);}}}drawPhotos();
}
function setBusy(value){busy=value;root.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);}
function drawPhotos(){
  const box=document.querySelector('#photos');if(!box)return;
  box.innerHTML=model.photos.map((p,i)=>`<div class="photo"><img src="${esc(p.preview||p.src||'')}" alt="照片 ${i+1}"><p>${i+1} / ${model.cover_id===p.id?'封面':''}</p><button type="button" data-action="up" data-index="${i}" ${i===0?'disabled':''}>上移</button><button type="button" data-action="down" data-index="${i}" ${i===model.photos.length-1?'disabled':''}>下移</button><button type="button" data-action="cover" data-index="${i}">设为封面</button><button type="button" data-action="remove" data-index="${i}">移除照片</button></div>`).join('');
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index),a=b.dataset.action;if(a==='cover')model.cover_id=model.photos[i].id;if(a==='remove'){model.photos.splice(i,1);if(!model.photos.some(p=>p.id===model.cover_id))model.cover_id=model.photos[0]?.id||null;}if(a==='up'&&i>0)[model.photos[i-1],model.photos[i]]=[model.photos[i],model.photos[i-1]];if(a==='down'&&i<model.photos.length-1)[model.photos[i+1],model.photos[i]]=[model.photos[i],model.photos[i+1]];dirty=true;drawPhotos();});
}
async function save(status){
  setBusy(true);
  try{
    const name=document.querySelector('#name').value.trim(), description=document.querySelector('#description').value.trim(),link=externalLink(document.querySelector('#link').value);
    if(!name)throw new Error('请填写 Project Name。');if(status==='PUBLISHED'&&!model.photos.length)throw new Error('发布前至少添加一张照片。');
    for(const [i,p] of model.photos.entries())if(p.blob&&!p.uploaded){notice(`上传 ${i+1}/${model.photos.length}；失败时可再次点击保存重试。`);await upload(p.path,p.blob,n=>document.querySelector('#progress').value=Math.round(100*(i+n)/model.photos.length));p.uploaded=true;}
    const photos=model.photos.map(({id,path,src,width,height})=>({id,...(path?{path}:{src}),width,height}));
    const payload={id:model.id,slug:model.slug,legacy_slug:model.legacy_slug||null,name,description,external_link:link,status,cover_id:model.cover_id,photos};
    const old=rows.find(r=>r.id===model.id);
    await request('/rest/v1/portfolio_projects?on_conflict=id',{method:'POST',body:payload,headers:{Prefer:'resolution=merge-duplicates,return=representation'},owner:true});
    const removed=(old?.photos||[]).map(p=>p.path).filter(path=>path&&!photos.some(p=>p.path===path));
    let cleanup='';if(removed.length)try{await request('/storage/v1/object/portfolio',{method:'DELETE',body:{prefixes:removed},owner:true});}catch(e){cleanup='\n内容已保存，但移除照片的存储清理失败，请在 Supabase Storage 清理孤立文件：'+e.message;}
    await list();notice((status==='PUBLISHED'?'已发布。':'草稿已保存，不对外公开。')+cleanup);
  }catch(e){notice(`未完成保存：${e.message}。可重试；不要关闭页面以免丢失待上传照片。`);}finally{setBusy(false);}
}
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
showLogin();
