-- ============================================================
-- ZERO GRAVITY — TRIGGER & EVENT FUNCTIONS
-- Run this AFTER supabase-schema.sql has been applied.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. On submission INSERT: compute response_time + final_score
-- ────────────────────────────────────────────────────────────
create or replace function public.zg_on_submission_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prob_created_at timestamptz;
  diff text;
  diff_weight float;
  speed_bonus float;
begin
  select submitted_at, difficulty
    into prob_created_at, diff
    from public.zg_client_problem_statements
   where id = new.problem_id;

  -- response time in hours
  new.response_time_hours := extract(epoch from (new.submitted_at - prob_created_at)) / 3600.0;

  -- difficulty weight
  diff_weight := case diff
    when 'easy'     then 1.0
    when 'medium'   then 1.5
    when 'hard'     then 2.0
    when 'critical' then 3.0
    else 1.0 end;

  -- speed bonus: max 10 pts, decays over 48 hours
  speed_bonus := greatest(0, 10.0 - (new.response_time_hours / 4.8));

  -- composite final score
  new.final_score := (new.quality_score * diff_weight)
                   + speed_bonus
                   + coalesce(new.client_rating, 0) * 4.0;

  -- bump total_submissions on the developer record
  update public.zg_member_interest
     set total_submissions = total_submissions + 1
   where auth_user_id = new.developer_id;

  return new;
end;
$$;

drop trigger if exists zg_submission_insert_trigger on public.zg_submissions;
create trigger zg_submission_insert_trigger
  before insert on public.zg_submissions
  for each row execute function public.zg_on_submission_insert();


-- ────────────────────────────────────────────────────────────
-- 2. Badge evaluator (called by other triggers)
-- ────────────────────────────────────────────────────────────
create or replace function public.zg_evaluate_badges(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  badge record;
  member record;
  current_val float;
  met boolean;
begin
  select problems_solved, success_rate, avg_rating,
         avg_response_time, total_submissions
    into member
    from public.zg_member_interest
   where auth_user_id = p_user_id;

  if not found then return; end if;

  for badge in select * from public.zg_badges loop
    current_val := case (badge.criteria->>'field')
      when 'problems_solved'   then member.problems_solved
      when 'success_rate'      then member.success_rate
      when 'avg_rating'        then member.avg_rating
      when 'avg_response_time' then member.avg_response_time
      when 'total_submissions' then member.total_submissions
      else 0 end;

    -- Speed Demon: lower is better
    if badge.criteria->>'field' = 'avg_response_time' then
      met := current_val > 0 and current_val < (badge.criteria->>'threshold')::float;
    else
      met := current_val >= (badge.criteria->>'threshold')::float;
    end if;

    if met then
      insert into public.zg_user_badges (user_id, badge_id)
        values (p_user_id, badge.id)
        on conflict do nothing;
    end if;

    -- upsert progress
    insert into public.zg_badge_progress (user_id, badge_id, progress, updated_at)
      values (
        p_user_id,
        badge.id,
        least(100, (current_val / greatest((badge.criteria->>'threshold')::float, 0.01) * 100)::int),
        now()
      )
      on conflict (user_id, badge_id) do update
        set progress   = excluded.progress,
            updated_at = now();
  end loop;
end;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. On submission UPDATE: handle accept + rating changes
-- ────────────────────────────────────────────────────────────
create or replace function public.zg_on_submission_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  diff text;
  diff_weight float;
  diff_bonus int;
  speed_bonus float;
begin
  -- Recalculate final_score whenever quality_score or client_rating changes
  if new.quality_score is distinct from old.quality_score
     or new.client_rating is distinct from old.client_rating then
    select difficulty into diff
      from public.zg_client_problem_statements
     where id = new.problem_id;

    diff_weight := case diff
      when 'easy'     then 1.0
      when 'medium'   then 1.5
      when 'hard'     then 2.0
      when 'critical' then 3.0
      else 1.0 end;

    speed_bonus := greatest(0, 10.0 - (new.response_time_hours / 4.8));

    new.final_score := (new.quality_score * diff_weight)
                     + speed_bonus
                     + coalesce(new.client_rating, 0) * 4.0;
  end if;

  -- When submission is accepted
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select difficulty into diff
      from public.zg_client_problem_statements
     where id = new.problem_id;

    diff_bonus := case diff
      when 'easy'     then 5
      when 'medium'   then 10
      when 'hard'     then 20
      when 'critical' then 35
      else 5 end;

    update public.zg_member_interest set
      problems_solved   = problems_solved + 1,
      success_rate      = (problems_solved + 1)::float / greatest(total_submissions, 1),
      avg_response_time = (avg_response_time * problems_solved + new.response_time_hours)
                          / greatest(problems_solved + 1, 1),
      reputation_score  = reputation_score + diff_bonus + 5
    where auth_user_id = new.developer_id;

    perform public.zg_evaluate_badges(new.developer_id);
  end if;

  -- When a client rating is given, update avg_rating + trust
  if new.client_rating is distinct from old.client_rating
     and new.client_rating is not null then
    update public.zg_member_interest m set
      avg_rating = (
        select coalesce(avg(s.client_rating), 0)
          from public.zg_submissions s
         where s.developer_id = new.developer_id
           and s.client_rating is not null
      ),
      trust_score = least(100,
        (select count(*) from public.zg_submissions
          where developer_id = new.developer_id and status = 'accepted') * 3
        + coalesce((
            select avg(client_rating)::int
              from public.zg_submissions
             where developer_id = new.developer_id
               and client_rating is not null
          ), 0) * 5
      ),
      is_client_preferred = (
        (select coalesce(avg(s2.client_rating), 0)
           from public.zg_submissions s2
          where s2.developer_id = new.developer_id
            and s2.client_rating is not null) > 4.5
        and m.problems_solved > 5
      ),
      reputation_score = m.reputation_score + new.client_rating
    where m.auth_user_id = new.developer_id;

    perform public.zg_evaluate_badges(new.developer_id);
  end if;

  return new;
end;
$$;

drop trigger if exists zg_submission_update_trigger on public.zg_submissions;
create trigger zg_submission_update_trigger
  before update on public.zg_submissions
  for each row execute function public.zg_on_submission_update();


-- ────────────────────────────────────────────────────────────
-- 4. Auto-tag fastest solution per problem (callable function)
-- ────────────────────────────────────────────────────────────
create or replace function public.zg_tag_fastest_solution(p_problem_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fastest_id uuid;
begin
  select id into fastest_id
    from public.zg_submissions
   where problem_id = p_problem_id
   order by response_time_hours asc
   limit 1;

  if fastest_id is not null then
    insert into public.zg_solution_tags (submission_id, tag, tagged_by)
      values (fastest_id, 'fastest', 'system')
      on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.zg_evaluate_badges(uuid) to authenticated;
grant execute on function public.zg_tag_fastest_solution(bigint) to authenticated;
