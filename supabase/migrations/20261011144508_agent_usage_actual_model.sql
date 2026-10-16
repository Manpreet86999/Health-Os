-- Store the actual provider-resolved model without prompt content.
create or replace function public.health_ai_settle(p_request_id text,p_usage jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare amount numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 amount:=coalesce((p_usage->>'estimatedCostUsd')::numeric,0);
 if amount<0 or amount>100 then raise exception 'Invalid usage amount'; end if;
 update public.health_ai_usage set charged_usd=amount,metadata=metadata||jsonb_build_object('configuredModel',metadata->>'model','model',left(p_usage->>'model',200),'latencyMs',p_usage->'latencyMs','tokens',p_usage->'tokens','estimatedCostUsd',amount,'escalationReason',case when p_usage ? 'escalationReason' then 'Previous model unavailable or invalid output' else null end)
 where user_id=auth.uid() and request_id=p_request_id and charged_usd is null;
 if not found then raise exception 'Usage reservation unavailable or already settled'; end if;
end $$;
