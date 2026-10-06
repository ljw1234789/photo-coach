import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.zip':'application/zip','.sql':'text/plain; charset=utf-8'};

export async function startStaticServer({port=0,prefix='/'}={}){
 if(!prefix.startsWith('/')||!prefix.endsWith('/'))throw new Error('prefix must start and end with /');
 const server=createServer(async(req,res)=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(prefix!=='/'&&pathname===prefix.slice(0,-1)){res.writeHead(302,{Location:prefix});res.end();return}
   if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('Not found');return}
   const name=decodeURIComponent(pathname.slice(prefix.length))||'index.html';
   const file=resolve(root,name);
   if(!file.startsWith(root+sep)){res.writeHead(404);res.end('Not found');return}
   const body=await readFile(file);
   res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return {url:`http://127.0.0.1:${server.address().port}${prefix}`,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await startStaticServer({port:Number(process.env.PORT||4173)});
 console.log(`取景本地网页：${server.url}`);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0)});
}
