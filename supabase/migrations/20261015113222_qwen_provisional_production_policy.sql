-- Qwen is the only active production model. No credential or owner record updates.
-- Provisional admission is reviewed server policy, never fabricated qualification evidence.
create or replace function public.health_ai_budget_reserve_owned(p_owner uuid,p_request_id text,p_maximum_usd numeric,p_monthly_limit_usd numeric,p_metadata jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid:=p_owner;spent numeric;configured_limit numeric;month_start date:=date_trunc('month',now() at time zone 'Asia/Kolkata')::date;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_maximum_usd is null or p_monthly_limit_usd is null or p_maximum_usd<0 or p_monthly_limit_usd<0 or p_monthly_limit_usd>5 or p_maximum_usd>5
 or coalesce(p_metadata->>'provider','')<>'openrouter'
 or coalesce(p_metadata->>'model','') not in ('qwen/qwen3-235b-a22b-2507')
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
create or replace function public.health_ai_protect_provider_preferences()
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
 new.payload:=new.payload||jsonb_build_object('hasOpenRouterApiKey',protected_id is not null,'aiProductionPrimaryModel','qwen/qwen3-235b-a22b-2507','aiProductionSecondaryModel','qwen/qwen3-235b-a22b-2507','aiPreferFree',false,'aiAllowPaid',true);
 return new;
end $$;
-- Permit genuine future Qwen qualification under the existing unchanged evidence gates.
alter table public.health_ai_model_qualification drop constraint health_ai_model_qualification_model_check;
alter table public.health_ai_model_qualification add constraint health_ai_model_qualification_model_check check(model in ('deepseek/deepseek-v4-flash-0731','z-ai/glm-5.3-flash','qwen/qwen3-235b-a22b-2507'));
alter table public.health_ai_model_qualification drop constraint health_ai_model_qualification_check1;
alter table public.health_ai_model_qualification add constraint health_ai_model_qualification_check1 check((gate='primary' and model='deepseek/deepseek-v4-flash-0731') or (gate<>'primary' and model='z-ai/glm-5.3-flash') or (model='qwen/qwen3-235b-a22b-2507' and gate<>'vision'));
