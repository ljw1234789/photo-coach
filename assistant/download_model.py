#!/usr/bin/env python3
"""Official qwen3-vl:4b-instruct download fallback; verify all blobs with SHA-256."""
import argparse,hashlib,json,os,re
from pathlib import Path
import requests
parser=argparse.ArgumentParser()
parser.add_argument('--tag',choices=['4b-instruct','8b-instruct'],default='4b-instruct')
tag=parser.parse_args().tag
BASE='https://registry.ollama.ai/v2/library/qwen3-vl'
root=Path(os.environ.get('OLLAMA_MODELS',str(Path.home()/'.ollama/models')))
(root/'blobs').mkdir(parents=True,exist_ok=True)
r=requests.get(BASE+'/manifests/'+tag,timeout=(15,60));r.raise_for_status();manifest=r.json()
for item in [manifest['config'],*manifest['layers']]:
    digest=item['digest']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}',digest): raise ValueError('官方模型清单格式异常')
    dest=root/'blobs'/digest.replace(':','-');expected=digest.split(':')[1]
    if dest.exists() and dest.stat().st_size==item['size']:
        with dest.open('rb') as f:
            if hashlib.file_digest(f,'sha256').hexdigest()==expected: continue
    print(f"下载模型文件：{round(item['size']/1024/1024)} MB",flush=True)
    temp=dest.with_suffix('.download');h=hashlib.sha256();total=0;last=0
    with requests.get(BASE+'/blobs/'+digest,stream=True,timeout=(15,120)) as response:
        response.raise_for_status()
        with temp.open('wb') as f:
            for chunk in response.iter_content(1024*1024):
                f.write(chunk);h.update(chunk);total+=len(chunk)
                pct=int(total/max(1,item['size'])*100)
                if pct>=last+10: print(f'{pct}%',flush=True);last=pct
    if total!=item['size'] or h.hexdigest()!=expected:
        temp.unlink(missing_ok=True);raise ValueError('模型校验未通过，请重试下载')
    os.replace(temp,dest)
path=root/'manifests/registry.ollama.ai/library/qwen3-vl'/tag
path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(manifest))
print('本地模型已下载并通过校验。',flush=True)
