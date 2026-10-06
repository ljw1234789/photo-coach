-- 取景 v1 · Run once in a new Supabase project's SQL Editor.
-- No service-role key is required by the browser or the local worker.
begin;
create table public.photo_assets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 path text not null unique, filename text not null, kind text not null check(kind in ('photo','reference')),
 note text not null default '', created_at timestamptz not null default now(),
 check(path like user_id::text || '/%')
);
create table public.records (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 photo_id uuid not null references public.photo_assets(id), reference_id uuid references public.photo_assets(id),
 parent_id uuid references public.records(id) on delete cascade,
 category text not null check(category in ('人像','日常随拍','风景','建筑')),
 device text not null check(device in ('手机','相机')), intent text not null default '',
 status text not null default 'pending' check(status in ('pending','running','completed','failed')),
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 result jsonb, duration_seconds numeric, model text, error text, accurate boolean not null default true,
 created_at timestamptz not null default now(), completed_at timestamptz,
 check(parent_id is distinct from id)
);
create table public.exercises (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 record_id uuid not null references public.records(id) on delete cascade, issue_index integer not null,
 title text not null, tag text not null, steps jsonb not null, success_criteria text not null,
 state text not null default 'todo' check(state in ('todo','practicing','done')),
 created_at timestamptz not null default now(), unique(record_id,issue_index)
);
alter table public.records add column exercise_id uuid references public.exercises(id) on delete set null;
create table public.worker_status (
 user_id uuid primary key references auth.users(id) on delete cascade,
 model text not null, last_seen timestamptz not null default now(), state text not null default 'idle'
);
create table public.garbage_paths (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 path text not null unique, created_at timestamptz not null default now()
);
create index records_owner_created on public.records(user_id,created_at desc);
create index records_queue on public.records(user_id,status,lease_until);
alter table public.photo_assets enable row level security;
alter table public.records enable row level security;
alter table public.exercises enable row level security;
alter table public.worker_status enable row level security;
alter table public.garbage_paths enable row level security;
create policy owner_assets on public.photo_assets for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy owner_records on public.records for select to authenticated using(user_id=auth.uid());
create policy owner_exercises on public.exercises for select to authenticated using(user_id=auth.uid());
create policy owner_worker on public.worker_status for select to authenticated using(user_id=auth.uid());
create policy owner_garbage on public.garbage_paths for select to authenticated using(user_id=auth.uid());
create policy remove_garbage on public.garbage_paths for delete to authenticated using(user_id=auth.uid());
-- Only narrowly scoped RPCs can change job/result/exercise state.
revoke all on public.photo_assets,public.records,public.exercises,public.worker_status,public.garbage_paths from anon,authenticated;
grant select,insert on public.photo_assets to authenticated;
grant select on public.records,public.exercises,public.worker_status to authenticated;
grant select,delete on public.garbage_paths to authenticated;

create function public.create_analysis(p_id uuid,p_photo uuid,p_reference uuid,p_category text,p_device text,p_intent text,p_parent uuid default null,p_exercise uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if not exists(select 1 from photo_assets where id=p_photo and user_id=auth.uid() and kind='photo') then raise exception '照片不存在'; end if;
 if p_reference is not null and not exists(select 1 from photo_assets where id=p_reference and user_id=auth.uid() and kind='reference') then raise exception '参考图不存在'; end if;
 if p_parent is not null and not exists(select 1 from records where id=p_parent and user_id=auth.uid() and status='completed') then raise exception '原片点评不存在'; end if;
 if p_exercise is not null and not exists(select 1 from exercises where id=p_exercise and user_id=auth.uid() and record_id=p_parent) then raise exception '练习与原片不匹配'; end if;
 if length(p_intent)>2000 then raise exception '拍摄意图过长'; end if;
 insert into records(id,user_id,photo_id,reference_id,category,device,intent,parent_id,exercise_id)
 values(p_id,auth.uid(),p_photo,p_reference,p_category,p_device,p_intent,p_parent,p_exercise)
 on conflict(id) do nothing;
 if not exists(select 1 from records where id=p_id and user_id=auth.uid()) then raise exception '无权访问'; end if;
 return p_id;
end $$;
create function public.claim_job(p_model text) returns jsonb language plpgsql security definer set search_path=public as $$
declare j records; payload jsonb;
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 insert into worker_status(user_id,model,last_seen,state) values(auth.uid(),p_model,now(),'idle') on conflict(user_id) do update set model=excluded.model,last_seen=now(),state='idle';
 update records set status='failed',error='任务中断多次，请重试',lease_token=null,lease_until=null
 where user_id=auth.uid() and status='running' and lease_until<now() and attempts>=3;
 select * into j from records where user_id=auth.uid() and attempts<3 and (status='pending' or (status='running' and lease_until<now())) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update records set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',error=null where id=j.id returning * into j;
 update worker_status set state='running' where user_id=auth.uid();
 select to_jsonb(j)||jsonb_build_object('photo',(select to_jsonb(a) from photo_assets a where a.id=j.photo_id),'reference',(select to_jsonb(a) from photo_assets a where a.id=j.reference_id),'parent',(select to_jsonb(r)||jsonb_build_object('photo',(select to_jsonb(a) from photo_assets a where a.id=r.photo_id)) from records r where r.id=j.parent_id),'exercise',(select to_jsonb(e) from exercises e where e.id=j.exercise_id)) into payload;
 return payload;
end $$;
create function public.heartbeat(p_model text,p_job uuid default null,p_lease uuid default null) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 insert into worker_status(user_id,model,last_seen,state) values(auth.uid(),p_model,now(),case when p_job is null then 'idle' else 'running' end) on conflict(user_id) do update set model=excluded.model,last_seen=now(),state=excluded.state;
 if p_job is null then return true; end if;
 update records set lease_until=now()+interval '3 minutes' where id=p_job and user_id=auth.uid() and status='running' and lease_token=p_lease and lease_until>now();
 return found;
end $$;
create function public.complete_job(p_id uuid,p_lease uuid,p_result jsonb,p_duration numeric,p_model text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if jsonb_typeof(p_result) is distinct from 'object' or jsonb_typeof(p_result->'issues') is distinct from 'array' or jsonb_array_length(p_result->'issues')>3 then raise exception '点评格式错误'; end if;
 update records set status='completed',result=p_result,duration_seconds=p_duration,model=p_model,completed_at=now(),lease_token=null,lease_until=null,error=null where id=p_id and user_id=auth.uid() and status='running' and lease_token=p_lease and lease_until>now();
 return found;
end $$;
create function public.fail_job(p_id uuid,p_lease uuid,p_error text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update records set status='failed',error=left(p_error,1000),lease_token=null,lease_until=null where id=p_id and user_id=auth.uid() and status='running' and lease_token=p_lease and lease_until>now();
 return found;
end $$;
create function public.retry_job(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update records set status='pending',attempts=0,error=null,lease_token=null,lease_until=null where id=p_id and user_id=auth.uid() and (status='failed' or (status='running' and lease_until<now()));
 return found;
end $$;
create function public.set_feedback(p_id uuid,p_accurate boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update records set accurate=p_accurate where id=p_id and user_id=auth.uid() and status='completed'; return found;
end $$;
create function public.save_exercise(p_record uuid,p_index integer) returns uuid language plpgsql security definer set search_path=public as $$
declare issue jsonb; out_id uuid;
begin
 select result->'issues'->p_index into issue from records where id=p_record and user_id=auth.uid() and status='completed' and accurate;
 if issue is null or p_index<0 or p_index>2 then raise exception '没有可用的练习'; end if;
 insert into exercises(user_id,record_id,issue_index,title,tag,steps,success_criteria) values(auth.uid(),p_record,p_index,issue->'exercise'->>'title',issue->>'tag',issue->'exercise'->'steps',issue->'exercise'->>'success_criteria') on conflict(record_id,issue_index) do update set title=exercises.title returning id into out_id;
 return out_id;
end $$;
create function public.set_exercise_state(p_id uuid,p_state text) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if p_state='done' and not exists(select 1 from records where exercise_id=p_id and user_id=auth.uid() and status='completed' and accurate) then raise exception '请先提交重拍并完成点评'; end if;
 update exercises set state=p_state where id=p_id and user_id=auth.uid(); return found;
end $$;
create function public.delete_record(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare ids uuid[]; photos uuid[];
begin
 if not exists(select 1 from records where id=p_id and user_id=auth.uid()) then return false; end if;
 with recursive tree as(select id,photo_id from records where id=p_id and user_id=auth.uid() union all select r.id,r.photo_id from records r join tree t on r.parent_id=t.id where r.user_id=auth.uid()) select array_agg(id),array_agg(photo_id) into ids,photos from tree;
 -- Metadata deletion invalidates all running leases before blob cleanup.
 delete from records where id=any(ids) and user_id=auth.uid();
 insert into garbage_paths(user_id,path) select user_id,path from photo_assets a where id=any(photos) and user_id=auth.uid() and not exists(select 1 from records where photo_id=a.id or reference_id=a.id) on conflict(path) do nothing;
 delete from photo_assets a where id=any(photos) and user_id=auth.uid() and not exists(select 1 from records where photo_id=a.id or reference_id=a.id);
 return true;
end $$;
create function public.delete_reference(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from records where reference_id=p_id and user_id=auth.uid()) then raise exception '这张参考图仍关联点评，请先删除关联点评'; end if;
 insert into garbage_paths(user_id,path) select user_id,path from photo_assets where id=p_id and user_id=auth.uid() and kind='reference' on conflict(path) do nothing;
 delete from photo_assets where id=p_id and user_id=auth.uid() and kind='reference'; return found;
end $$;
-- Clean up an upload when the job-creation request did not reach the server.
create function public.delete_unused_asset(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into garbage_paths(user_id,path) select user_id,path from photo_assets a where id=p_id and user_id=auth.uid() and not exists(select 1 from records where photo_id=a.id or reference_id=a.id) on conflict(path) do nothing;
 delete from photo_assets a where id=p_id and user_id=auth.uid() and not exists(select 1 from records where photo_id=a.id or reference_id=a.id); return found;
end $$;
-- Functions are NOT public APIs for anonymous visitors.
revoke execute on function public.create_analysis(uuid,uuid,uuid,text,text,text,uuid,uuid),public.claim_job(text),public.heartbeat(text,uuid,uuid),public.complete_job(uuid,uuid,jsonb,numeric,text),public.fail_job(uuid,uuid,text),public.retry_job(uuid),public.set_feedback(uuid,boolean),public.save_exercise(uuid,integer),public.set_exercise_state(uuid,text),public.delete_record(uuid),public.delete_reference(uuid),public.delete_unused_asset(uuid) from public,anon;
grant execute on function public.create_analysis(uuid,uuid,uuid,text,text,text,uuid,uuid),public.claim_job(text),public.heartbeat(text,uuid,uuid),public.complete_job(uuid,uuid,jsonb,numeric,text),public.fail_job(uuid,uuid,text),public.retry_job(uuid),public.set_feedback(uuid,boolean),public.save_exercise(uuid,integer),public.set_exercise_state(uuid,text),public.delete_record(uuid),public.delete_reference(uuid),public.delete_unused_asset(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photo-coach','photo-coach',false,20971520,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy private_photos_read on storage.objects for select to authenticated using(bucket_id='photo-coach' and (storage.foldername(name))[1]=auth.uid()::text);
create policy private_photos_upload on storage.objects for insert to authenticated with check(bucket_id='photo-coach' and (storage.foldername(name))[1]=auth.uid()::text);
create policy private_photos_delete on storage.objects for delete to authenticated using(bucket_id='photo-coach' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
