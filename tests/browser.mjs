import {chromium} from 'playwright';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {startStaticServer} from '../scripts/serve.mjs';
const server=process.env.PHOTO_COACH_TEST_URL?null:await startStaticServer({prefix:'/photo-coach/'});
const chrome=process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined;
let browser;try{browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})})}catch(e){await server?.close();throw e}
const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.PHOTO_COACH_TEST_URL||server.url;
const image=readFileSync('dist/assets/sample.jpg'),sample=JSON.parse(readFileSync('dist/assets/sample-review.json','utf8')).result;
let assets=[],records=[],exercises=[],garbage=[],uploads=0,creates=0,loseResponse=true,online=false;
const owner='11111111-1111-4111-8111-111111111111';
await page.addInitScript(()=>{window.registeredTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.registeredTools[tool.name]=tool}}})});
await page.route('https://test.supabase.co/**',async route=>{
 const request=route.request(),u=new URL(request.url()),path=u.pathname,method=request.method();let body=null;try{body=request.postDataJSON()}catch{}let data=null,status=200;
 if(path==='/auth/v1/token')data={access_token:'fake-access',refresh_token:'fake-refresh',expires_in:3600,user:{id:owner,email:'photo@example.com'}};
 else if(path==='/auth/v1/signup')data={user:{id:owner}};
 else if(path==='/rest/v1/records')data=records;
 else if(path==='/rest/v1/exercises')data=exercises;
 else if(path==='/rest/v1/worker_status')data=[{user_id:owner,model:'qwen3-vl:4b',last_seen:new Date(Date.now()-(online?0:200000)).toISOString()}];
 else if(path==='/rest/v1/photo_assets'){if(method==='POST'){assets.unshift({...body,created_at:new Date().toISOString()});data=null}else data=assets}
 else if(path==='/rest/v1/garbage_paths'){if(method==='DELETE'){garbage=[];data=null}else data=garbage}
 else if(path.startsWith('/storage/v1/object/sign/'))data={signedURL:'/object/sign/photo-coach/sample.jpg?token=fake'};
 else if(path.startsWith('/storage/v1/object/')){if(method==='GET'){await route.fulfill({status:200,contentType:'image/jpeg',body:image});return}if(method==='POST')uploads++;data={};}
 else if(path.endsWith('/rpc/create_analysis')){
  creates++;if(!records.some(r=>r.id===body.p_id))records.unshift({id:body.p_id,user_id:owner,photo_id:body.p_photo,reference_id:body.p_reference,parent_id:body.p_parent,exercise_id:body.p_exercise,category:body.p_category,device:body.p_device,intent:body.p_intent,status:'pending',accurate:true,created_at:new Date().toISOString()});
  data=body.p_id;if(loseResponse){loseResponse=false;await route.abort('failed');return}
 }
 else if(path.endsWith('/rpc/save_exercise')){const id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';if(!exercises.length)exercises=[{id,user_id:owner,record_id:body.p_record,issue_index:body.p_index,title:sample.issues[body.p_index].exercise.title,tag:sample.issues[body.p_index].tag,steps:sample.issues[body.p_index].exercise.steps,success_criteria:sample.issues[body.p_index].exercise.success_criteria,state:'todo',created_at:new Date().toISOString()}];data=id}
 else if(path.endsWith('/rpc/set_feedback')){records.find(r=>r.id===body.p_id).accurate=body.p_accurate;data=true}
 else if(path.endsWith('/rpc/set_exercise_state')){exercises.find(e=>e.id===body.p_id).state=body.p_state;data=true}
 else if(path.endsWith('/rpc/delete_record')){const ids=records.filter(r=>r.id===body.p_id||r.parent_id===body.p_id).map(r=>r.id);const photoids=records.filter(r=>ids.includes(r.id)).map(r=>r.photo_id);garbage=assets.filter(a=>photoids.includes(a.id)).map(a=>({id:a.id,path:a.path}));records=records.filter(r=>!ids.includes(r.id));exercises=exercises.filter(e=>!ids.includes(e.record_id));assets=assets.filter(a=>!photoids.includes(a.id));data=true}
 else if(path.endsWith('/rpc/retry_job')){records.find(r=>r.id===body.p_id).status='pending';data=true}
 else{status=404;data={message:'unhandled test request '+path}}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
});
try{
 await page.goto(base);
 await page.locator('#photo').setInputFiles('dist/assets/sample.jpg');await page.locator('#intent').fill('自然、放松的秋日人像');
 await page.getByRole('button',{name:'开始分析',exact:true}).click();await page.getByRole('heading',{name:'1. 连接私人档案'}).waitFor();
 await page.locator('#project-url').fill('https://test.supabase.co');await page.locator('#public-key').fill('sb_secret_wrong');await page.getByRole('button',{name:'保存连接'}).click();await page.getByRole('status').filter({hasText:'不能使用私密密钥'}).waitFor();
 await page.locator('#public-key').fill('sb_publishable_test');await page.getByRole('button',{name:'保存连接'}).click();
 await page.locator('#email').fill('photo@example.com');await page.locator('#password').fill('test-password');await page.getByRole('button',{name:'登录档案',exact:true}).click();await page.getByText('已登录：photo@example.com').waitFor();
 await page.locator('[data-tab="analyze"]').click();assert.equal(await page.locator('#intent').inputValue(),'自然、放松的秋日人像');
 await page.getByRole('button',{name:'开始分析',exact:true}).click();await page.getByRole('button',{name:'继续提交',exact:true}).waitFor();assert.equal(uploads,1);
 await page.getByRole('button',{name:'继续提交',exact:true}).click();await page.getByRole('heading',{name:'照片已经保存。'}).waitFor();assert.equal(uploads,1);assert.equal(creates,2);assert.equal(records.length,1);assert.equal(await page.getByRole('heading',{name:'等待电脑分析',exact:true}).count(),1);
 // Analysis becomes available from the worker, without a second upload.
 records[0]={...records[0],status:'completed',result:sample,duration_seconds:30,model:'qwen3-vl:4b'};online=true;
 await page.locator('.topbar [data-tab="settings"]').click();await page.getByRole('button',{name:'测试云端连接'}).click();await page.getByText('已连接',{exact:true}).waitFor();
 await page.locator('[data-tab="growth"]').click();await page.locator('[data-open]').first().click();await page.getByRole('heading',{name:'拍摄建议'}).waitFor();await page.locator('[data-highlight="0"]').click();assert.equal(await page.locator('#issue-0.highlight').count(),1);
 await page.getByRole('button',{name:'加入我的练习',exact:true}).first().click();await page.getByRole('button',{name:'练习已保存',exact:true}).first().waitFor();
 await page.getByRole('button',{name:'这份点评不准确'}).click();await page.getByText('你已标记这份点评不准确').waitFor();assert.equal(records[0].accurate,false);
 await page.getByRole('button',{name:'恢复计入成长记录'}).click();await page.getByRole('button',{name:'这份点评不准确'}).waitFor();
 await page.locator('[data-tab="practice"]').click();await page.getByRole('button',{name:'提交练习重拍'}).click();await page.locator('#photo').setInputFiles('dist/assets/sample.jpg');await page.getByRole('button',{name:'开始分析',exact:true}).click();await page.getByRole('heading',{name:'照片已经保存。'}).waitFor();assert.equal(records.length,2);assert.ok(records[0].parent_id);assert.equal(records[0].exercise_id,exercises[0].id);
 records[0]={...records[0],status:'completed',result:{...sample,comparison:{improved:['背景更简洁'],unchanged:['继续练习光线'],next_step:'试着改变站位',limitations:'测试数据'}}};
 await page.locator('.topbar [data-tab="settings"]').click();await page.getByRole('button',{name:'测试云端连接'}).click();await page.locator('[data-tab="practice"]').click();await page.getByRole('button',{name:'标记完成'}).click();await page.getByText('已完成',{exact:true}).waitFor();
 await page.locator('[data-tab="references"]').click();await page.locator('#reference-note').fill('喜欢柔和的光线');await page.locator('#library-file').setInputFiles('dist/assets/sample.jpg');await page.getByRole('button',{name:'保存到参考图库'}).click();await page.getByRole('button',{name:'用于下一次分析'}).waitFor();await page.getByRole('button',{name:'用于下一次分析'}).click();await page.getByText('和你的照片一起分析',{exact:true}).waitFor();assert.ok(await page.locator('#reference-id').inputValue());
 await page.locator('[data-tab="growth"]').click();const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出记录'}).click();const download=await downloaded;const exported=JSON.parse(readFileSync(await download.path(),'utf8'));assert.equal(exported.records.length,2);assert.ok(!JSON.stringify(exported).includes('fake-access'));
 await page.locator('[data-open]').last().click();await page.getByRole('button',{name:'删除这张记录'}).click();await page.getByRole('button',{name:'确认删除'}).click();await page.getByRole('status').filter({hasText:'记录和照片已删除'}).waitFor();assert.equal(records.length,0);assert.equal(exercises.length,0);assert.equal(assets.filter(a=>a.kind==='reference').length,1);
 const tools=await page.evaluate(async()=>{const names=Object.keys(window.registeredTools);await window.registeredTools.navigate_photo_coach.execute({view:'growth'});let invalid=false;try{await window.registeredTools.navigate_photo_coach.execute({view:'unknown'})}catch{invalid=true}const read=await window.registeredTools.get_photo_coach_records.execute({});return {names,invalid,read}});assert.equal(tools.names.length,2);assert.ok(tools.invalid);assert.equal(tools.read.records.length,0);
 await page.locator('[data-tab="analyze"]').click();await page.getByRole('button',{name:'看看一张照片怎样被点评',exact:false}).click();await page.getByRole('heading',{name:'秋日街头人像'}).waitFor();await page.screenshot({path:'/tmp/photo-coach-desktop.png',fullPage:true});
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:900});for(const tab of ['analyze','practice','references','growth']){if(tab!=='analyze')await page.locator(`[data-tab="${tab}"]`).click();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,`overflow ${width} ${tab}`)}}
 await page.locator('[data-tab="analyze"]').click();await page.screenshot({path:'/tmp/photo-coach-mobile.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.style.fontSize='200%');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'overflow at 200% text');
 assert.deepEqual(errors,[]);console.log('PASS: upload, config, login, uncertain submit retry, offline queue, review, feedback, exercise/reshoot, references, export, deletion, WebMCP adapter, responsive layouts & 200% text');
}finally{await browser.close();await server?.close()}
