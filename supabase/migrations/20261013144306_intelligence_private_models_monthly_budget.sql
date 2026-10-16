-- Reuse the current owner credential in Vault; never serialize it into client records.
create table public.health_ai_provider_secret (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider='openrouter'),
 secret_id uuid not null references vault.secrets(id),
 primary key(user_id,provider)
);
alter table public.health_ai_provider_secret enable row level security;
revoke all on public.health_ai_provider_secret from public,anon,authenticated;
grant select,insert,update,delete on public.health_ai_provider_secret to service_role;

create function public.health_ai_provider_secret_get(p_owner uuid,p_provider text)
returns text language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null or p_provider<>'openrouter' then
  raise exception 'Server credential access required' using errcode='42501';
 end if;
 select s.decrypted_secret into result from public.health_ai_provider_secret p
 join vault.decrypted_secrets s on s.id=p.secret_id where p.user_id=p_owner and p.provider=p_provider;
 return result;
end $$;
revoke all on function public.health_ai_provider_secret_get(uuid,text) from public,anon,authenticated;
grant execute on function public.health_ai_provider_secret_get(uuid,text) to service_role;
grant select,update on public.health_ai_usage to service_role;

-- Move existing credentials without putting their value in a migration or API response.
do $$
declare pref record; existing_key text; protected_id uuid; cleaned jsonb;
begin
 for pref in select user_id,record_id,payload from public.body_os_records
 where entity_type='sharedPreferences' and record_id='shared-preferences' and deleted_at is null loop
  existing_key:=nullif(pref.payload->>'openRouterApiKey','');
  if existing_key is null and coalesce(pref.payload->>'aiProvider','openrouter')<>'nvidia' then
   existing_key:=nullif(pref.payload->>'aiApiKey','');
  end if;
  if existing_key is null then continue;end if;
  select secret_id into protected_id from public.health_ai_provider_secret where user_id=pref.user_id and provider='openrouter';
  if protected_id is null then
   protected_id:=vault.create_secret(existing_key,'healthos-openrouter-'||pref.user_id::text,'Existing Health OS owner provider credential');
   insert into public.health_ai_provider_secret(user_id,provider,secret_id) values(pref.user_id,'openrouter',protected_id);
  end if;
  cleaned:=pref.payload-'openRouterApiKey';
  if coalesce(pref.payload->>'aiProvider','openrouter')<>'nvidia' or pref.payload->>'aiApiKey'=existing_key then cleaned:=cleaned-'aiApiKey';end if;
  if pref.payload->>'nvidiaNimApiKey'=existing_key then cleaned:=cleaned-'nvidiaNimApiKey';end if;
  -- The role policy is fixed server-side. Non-secret provider status remains readable.
  cleaned:=cleaned||jsonb_build_object('hasOpenRouterApiKey',true,'aiProductionPrimaryModel','deepseek/deepseek-v4-flash-0731','aiProductionSecondaryModel','z-ai/glm-5.3-flash','aiPreferFree',false,'aiAllowPaid',true,'aiMonthlyPaidLimitUsd',5);
  update public.body_os_records set payload=cleaned,revision=revision+1,updated_at=now() where user_id=pref.user_id and entity_type='sharedPreferences' and record_id=pref.record_id and deleted_at is null;
  existing_key:=null;protected_id:=null;
 end loop;
end $$;

-- Older clients may replay cached preferences. Keep the public record secret-free.
create function public.health_ai_protect_provider_preferences()
returns trigger language plpgsql security definer set search_path='' as $$
declare incoming_key text;protected_id uuid;protected_value text;alias_name text;
begin
 if new.entity_type<>'sharedPreferences' or new.record_id<>'shared-preferences' then return new;end if;
 if auth.role() is not null and auth.role()<>'service_role' and auth.uid() is distinct from new.user_id then raise exception 'Preference owner mismatch' using errcode='42501';end if;
 incoming_key:=nullif(new.payload->>'openRouterApiKey','');
 if incoming_key is null and coalesce(new.payload->>'aiProvider','openrouter')<>'nvidia' then incoming_key:=nullif(new.payload->>'aiApiKey','');end if;
 select secret_id into protected_id from public.health_ai_provider_secret where user_id=new.user_id and provider='openrouter';
 if protected_id is null and incoming_key is not null and new.deleted_at is null then
  protected_id:=vault.create_secret(incoming_key,'healthos-openrouter-'||new.user_id::text,'Existing Health OS owner provider credential');
  insert into public.health_ai_provider_secret(user_id,provider,secret_id) values(new.user_id,'openrouter',protected_id);
 end if;
 new.payload:=new.payload-'openRouterApiKey';
 if protected_id is not null then select decrypted_secret into protected_value from vault.decrypted_secrets where id=protected_id;end if;
 if coalesce(new.payload->>'aiProvider','openrouter')<>'nvidia' or new.payload->>'aiApiKey'=protected_value then new.payload:=new.payload-'aiApiKey';end if;
 for alias_name in select unnest(array['aiApiKey','apiKey','providerApiKey','openrouterKey']) loop
  if alias_name='openrouterKey' or coalesce(new.payload->>'aiProvider','openrouter')<>'nvidia' or new.payload->>alias_name=protected_value or new.payload->>alias_name like 'sk-or-%' then new.payload:=new.payload-alias_name;end if;
 end loop;
 if new.payload->>'nvidiaNimApiKey'=protected_value or new.payload->>'nvidiaNimApiKey' like 'sk-or-%' then new.payload:=new.payload-'nvidiaNimApiKey';end if;
 new.payload:=new.payload||jsonb_build_object('hasOpenRouterApiKey',protected_id is not null,'aiProductionPrimaryModel','deepseek/deepseek-v4-flash-0731','aiProductionSecondaryModel','z-ai/glm-5.3-flash','aiPreferFree',false,'aiAllowPaid',true);
 return new;
end $$;
revoke all on function public.health_ai_protect_provider_preferences() from public,anon,authenticated,service_role;
create trigger health_ai_protect_provider_preferences before insert or update of payload on public.body_os_records for each row execute function public.health_ai_protect_provider_preferences();
-- Scrub historical/tombstoned copies too, without reactivating their credentials.
update public.body_os_records set payload=payload,revision=revision+1,updated_at=now() where entity_type='sharedPreferences' and record_id='shared-preferences';

-- Reservations serialize the whole calendar month's spend across devices.
create function public.health_ai_budget_reserve_owned(p_owner uuid,p_request_id text,p_maximum_usd numeric,p_monthly_limit_usd numeric,p_metadata jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid:=p_owner;spent numeric;configured_limit numeric;month_start date:=date_trunc('month',now() at time zone 'Asia/Kolkata')::date;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_maximum_usd is null or p_monthly_limit_usd is null or p_maximum_usd<0 or p_monthly_limit_usd<0 or p_monthly_limit_usd>5 or p_maximum_usd>5
 or coalesce(p_metadata->>'provider','')<>'openrouter'
 or coalesce(p_metadata->>'model','') not in ('deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash')
 then raise exception 'Invalid production model budget' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,73));
 select coalesce(least(5,greatest(0,(payload->>'aiMonthlyPaidLimitUsd')::numeric)),5) into configured_limit from public.body_os_records
 where user_id=owner and entity_type='sharedPreferences' and record_id='shared-preferences' and deleted_at is null;
 configured_limit:=coalesce(configured_limit,5);
 select coalesce(sum(coalesce(charged_usd,reserved_usd)),0) into spent from public.health_ai_usage
 where user_id=owner and usage_day>=month_start and usage_day<(month_start+interval '1 month')::date;
 if spent+p_maximum_usd>least(p_monthly_limit_usd,configured_limit) then raise exception 'Monthly Intelligence budget exceeded' using errcode='22023';end if;
 insert into public.health_ai_usage(user_id,request_id,reserved_usd,metadata) values(owner,p_request_id,p_maximum_usd,jsonb_build_object('role',p_metadata->>'role','model',p_metadata->>'model','provider','openrouter','paid',true,'reason',p_metadata->>'reason','budgetPeriod','month'));
end $$;
revoke all on function public.health_ai_budget_reserve_owned(uuid,text,numeric,numeric,jsonb) from public,anon,authenticated,service_role;
create function public.health_ai_reserve_production(p_request_id text,p_maximum_usd numeric,p_monthly_limit_usd numeric,p_metadata jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.health_ai_budget_reserve_owned(auth.uid(),p_request_id,p_maximum_usd,p_monthly_limit_usd,p_metadata);
end $$;
create function public.health_ai_reserve_service(p_owner uuid,p_request_id text,p_maximum_usd numeric,p_monthly_limit_usd numeric,p_metadata jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server budget access required' using errcode='42501';end if;
 perform public.health_ai_budget_reserve_owned(p_owner,p_request_id,p_maximum_usd,p_monthly_limit_usd,p_metadata);
end $$;
revoke all on function public.health_ai_reserve_service(uuid,text,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.health_ai_reserve_service(uuid,text,numeric,numeric,jsonb) to service_role;
create function public.health_ai_settle_service(p_owner uuid,p_request_id text,p_usage jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare amount numeric;
begin
 if auth.role() is distinct from 'service_role' or p_owner is null then raise exception 'Server budget access required' using errcode='42501';end if;
 amount:=coalesce((p_usage->>'estimatedCostUsd')::numeric,0);
 if amount<0 or amount>100 then raise exception 'Invalid usage amount';end if;
 update public.health_ai_usage set charged_usd=amount,metadata=metadata||jsonb_build_object('latencyMs',p_usage->'latencyMs','tokens',p_usage->'tokens','estimatedCostUsd',amount,'escalationReason',case when p_usage ? 'escalationReason' then 'Previous model unavailable or invalid output' else null end)
 where user_id=p_owner and request_id=p_request_id and charged_usd is null;
 if not found then raise exception 'Usage reservation unavailable or already settled';end if;
end $$;
revoke all on function public.health_ai_settle_service(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.health_ai_settle_service(uuid,text,jsonb) to service_role;
revoke all on function public.health_ai_reserve_production(text,numeric,numeric,jsonb) from public,anon;
grant execute on function public.health_ai_reserve_production(text,numeric,numeric,jsonb) to authenticated;

create function public.health_ai_usage_summary_production()
returns jsonb language sql stable security invoker set search_path='' as $$
 select public.health_ai_usage_summary()||jsonb_build_object(
 'month',to_char(now() at time zone 'Asia/Kolkata','YYYY-MM'),
 'monthlyLimitUsd',coalesce((select least(5,greatest(0,(payload->>'aiMonthlyPaidLimitUsd')::numeric)) from public.body_os_records where user_id=auth.uid() and entity_type='sharedPreferences' and record_id='shared-preferences' and deleted_at is null),5),
 'monthlyPaidUsd',(select coalesce(sum(coalesce(charged_usd,reserved_usd)),0) from public.health_ai_usage where user_id=auth.uid() and usage_day>=date_trunc('month',now() at time zone 'Asia/Kolkata')::date and usage_day<(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date));
$$;
revoke all on function public.health_ai_usage_summary_production() from public,anon;
grant execute on function public.health_ai_usage_summary_production() to authenticated;

-- Qualification is evidence-derived and server-maintained, separate from reachability.
create table public.health_ai_model_qualification (
 user_id uuid not null references auth.users(id) on delete cascade,
 model text not null check(model in ('deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash')),
 gate text not null check(gate in ('primary','fallback','verifier','vision')),
 repetitions integer not null check(repetitions>=0),
 samples integer not null check(samples>=0),
 score numeric not null check(score>=0 and score<=1),
 critical_failures integer not null check(critical_failures>=0),
 benchmark_hash text not null check(length(benchmark_hash)=64),
 evaluated_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>evaluated_at),
 primary key(user_id,model,gate),
 check((gate='primary' and model='deepseek/deepseek-v4-flash-0731') or (gate<>'primary' and model='z-ai/glm-5.3-flash'))
);
alter table public.health_ai_model_qualification enable row level security;
create policy health_ai_model_qualification_owner on public.health_ai_model_qualification to authenticated using(user_id=(select auth.uid()));
revoke all on public.health_ai_model_qualification from public,anon,authenticated;
grant select on public.health_ai_model_qualification to authenticated;
grant select,insert,update,delete on public.health_ai_model_qualification to service_role;
