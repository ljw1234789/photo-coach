const CONFIG_KEY='photo-coach.connection',SESSION_KEY='photo-coach.session';
function parseStored(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
export function validateConfig(url,key){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('请输入完整的 https 项目地址，不包含路径。');
 if(!key||key.startsWith('sb_secret_'))throw new Error('请使用 Publishable key 或 anon key，不能使用私密密钥。');
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw new Error('只能使用 anon key。')}catch{throw new Error('这不是有效的 anon 公开密钥。')}}
 return {url:u.origin,key};
}
export class Cloud{
 constructor(){this.config=parseStored(CONFIG_KEY);this.session=parseStored(SESSION_KEY);this.refreshing=null;}
 get configured(){return !!this.config}
 get loggedIn(){return !!this.session?.access_token}
 get user(){return this.session?.user}
 configure(url,key){const next=validateConfig(url,key);if(this.config?.url!==next.url||this.config?.key!==next.key){this.session=null;localStorage.removeItem(SESSION_KEY)}this.config=next;localStorage.setItem(CONFIG_KEY,JSON.stringify(next));}
 saveSession(session){this.session={...session,expires_at:session.expires_at||Math.floor(Date.now()/1000)+Number(session.expires_in||3600)};localStorage.setItem(SESSION_KEY,JSON.stringify(this.session));}
 async auth(path,body){if(!this.config)throw new Error('请先填写云端连接。');return this.request('/auth/v1/'+path,{method:'POST',body,auth:false});}
 async login(email,password){const s=await this.auth('token?grant_type=password',{email,password});this.saveSession(s);}
 async signup(email,password){const s=await this.auth('signup?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email,password});if(s.access_token)this.saveSession(s);return !!s.access_token;}
 async logout(){try{if(this.loggedIn)await this.request('/auth/v1/logout',{method:'POST'})}finally{this.session=null;localStorage.removeItem(SESSION_KEY)}}
 async token(){
  if(!this.loggedIn)throw new Error('请先登录私人档案。');
  if(this.session.expires_at*1000>Date.now()+90000)return this.session.access_token;
  if(!this.refreshing)this.refreshing=(async()=>{try{const s=await this.auth('token?grant_type=refresh_token',{refresh_token:this.session.refresh_token});this.saveSession(s);return s.access_token}catch(e){if(e.status===400||e.status===401){this.session=null;localStorage.removeItem(SESSION_KEY)}throw e}finally{this.refreshing=null}})();
  return this.refreshing;
 }
 async request(path,{method='GET',body,auth=true,headers={}}={}){
  if(!this.config)throw new Error('尚未配置云端档案。');
  const token=auth?await this.token():null;
  const opts={method,headers:{apikey:this.config.key,...(token?{Authorization:'Bearer '+token}:{}),...headers},signal:AbortSignal.timeout(45000)};
  if(body!==undefined){if(body instanceof Blob){opts.body=body}else{opts.body=JSON.stringify(body);opts.headers['Content-Type']='application/json'}}
  let response;try{response=await fetch(this.config.url+path,opts)}catch(e){throw new Error(e.name==='TimeoutError'?'请求超时，照片和输入已保留，请稍后重试。':'连接中断，请检查网络后重试。')}
  let data;try{data=await response.json()}catch{data=null}
  if(!response.ok){const err=new Error(data?.message||data?.msg||data?.error_description||data?.error||`请求失败 (${response.status})`);err.status=response.status;throw err}
  return data;
 }
 rpc(name,body={}){return this.request('/rest/v1/rpc/'+name,{method:'POST',body});}
 async rows(table){const rows=[];for(let offset=0;;offset+=500){const page=await this.request(`/rest/v1/${table}?select=*&order=created_at.desc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)break}return rows;}
 async worker(){return (await this.request('/rest/v1/worker_status?select=*'))[0]||null}
 async upload(file,kind='photo',note=''){
  await this.token();const id=crypto.randomUUID(),path=this.user.id+'/'+id+(file.type==='image/png'?'.png':'.jpg');
  await this.request('/storage/v1/object/photo-coach/'+path,{method:'POST',body:file,headers:{'Content-Type':file.type,'x-upsert':'false'}});
  const asset={id,user_id:this.user.id,path,filename:file.name||'照片.jpg',kind,note};
  try{await this.request('/rest/v1/photo_assets',{method:'POST',body:asset,headers:{Prefer:'return=minimal'}})}catch(e){try{await this.removePaths([path])}catch{}throw e}
  return asset;
 }
 async signed(path){const r=await this.request('/storage/v1/object/sign/photo-coach/'+path,{method:'POST',body:{expiresIn:3600}});const signed=r.signedURL||r.signedUrl;if(!signed)throw new Error('无法打开照片');return this.config.url+'/storage/v1'+signed;}
 removePaths(paths){return this.request('/storage/v1/object/photo-coach',{method:'DELETE',body:{prefixes:paths}})}
 async cleanup(){const rows=await this.request('/rest/v1/garbage_paths?select=*');for(const row of rows){await this.removePaths([row.path]);await this.request('/rest/v1/garbage_paths?id=eq.'+row.id,{method:'DELETE'})}return rows.length}
 async unused(id){await this.rpc('delete_unused_asset',{p_id:id});await this.cleanup()}
}
