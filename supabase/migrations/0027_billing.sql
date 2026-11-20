-- 더 라인 — 멤버십 정기결제(KG이니시스 빌링)
--
-- 흐름(온마스에서 실제 결제로 검증한 방식):
--   1. 구독 화면에서 [결제하기] → billing_checkouts에 주문 한 줄(누가·어떤 요금제) → 이니시스 카드 등록 창(팝업)
--   2. 카드 등록 결과 → 서버가 결과 서명을 확인하고 빌링키를 주문에 저장만(billkey_issued). 여기서는 결제하지 않음
--      (이니시스 경고: 결과 화면 새로고침으로 중복 결제될 수 있음)
--   3. 구독 화면이 "가입 확정"을 한 번 부르면 첫 결제 승인 → payments에 기록, 빌링키를 billing_keys로 옮기고
--      member_subscriptions를 이용 중(active)으로, 이용 기간 끝(current_period_end)을 한 달·일 년 뒤로
--   3. 매일 서버 작업(크론)이 결제일이 된 구독을 같은 빌링키로 다시 결제(자동갱신) → payments에 기록
--   4. 해지하면 cancel_at_period_end = true — 남은 기간까지 이용하고 다음 결제부터 멈춤
--   * 연간은 1회 결제(일반결제 상점) — 자동갱신 없이 1년 뒤 끝남(auto_renew = false). 카드 등록 없이
--     일반결제창에서 바로 결제되고, 결과를 받는 곳에서 승인까지 마칩니다(이니시스 일반결제 방식).
--
-- 빌링키(카드 결제 열쇠)는 서버만 읽습니다(billing_keys는 정책 없이 RLS만 켬 → 서버 키로만 접근).
-- 회원은 자기 결제 기록(payments)과 구독 상태만 읽을 수 있고, 쓰기는 모두 서버가 합니다.
--
-- 0026 다음에 실행하세요. 여러 번 실행해도 안전합니다.

-- ─────────────────────────────────────────────
-- 1. 구독에 날짜·해지 예약·카드 표시 칸 더하기
-- ─────────────────────────────────────────────
alter table member_subscriptions add column if not exists started_at timestamptz;          -- 처음 결제해 구독을 시작한 때
alter table member_subscriptions add column if not exists last_paid_at timestamptz;        -- 가장 최근 결제가 된 때
alter table member_subscriptions add column if not exists cancel_at_period_end boolean not null default false; -- 해지 예약
alter table member_subscriptions add column if not exists canceled_at timestamptz;         -- 해지를 누른 때
alter table member_subscriptions add column if not exists card_label text;                 -- 화면 표시용 "신한카드 1234"
alter table member_subscriptions add column if not exists failed_attempts int not null default 0; -- 자동갱신 실패 횟수
alter table member_subscriptions add column if not exists auto_renew boolean not null default true; -- 월간 정기결제 true, 연간 1회 결제 false

-- ─────────────────────────────────────────────
-- 2. 빌링키 — 서버 전용
-- ─────────────────────────────────────────────
create table if not exists billing_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'inicis',
  billing_key text not null,
  card_label text,
  buyer_tel text,                -- 자동갱신 승인에도 연락처가 필요해서 함께 보관
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_keys enable row level security; -- 정책 없음: 서버 키로만 읽고 씀

-- ─────────────────────────────────────────────
-- 3. 결제 주문 — 첫 결제는 카드 등록 창을 열 때, 자동갱신은 결제할 때 한 줄씩.
--    이니시스가 결과를 보낼 때 누가 결제했는지 찾고(그 요청엔 로그인 쿠키가 오지 않음),
--    같은 주문번호를 두 번 결제하지 않게 막습니다(자동갱신 주문번호는 날짜가 들어가 하루 한 번만).
-- ─────────────────────────────────────────────
create table if not exists billing_checkouts (
  oid text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references plans(code),
  amount int not null,
  kind text not null default 'first' check (kind in ('first', 'renewal', 'onetime')), -- onetime: 연간 1회 결제
  status text not null default 'pending'
    check (status in ('pending', 'billkey_issued', 'processing', 'paid', 'failed')), -- billkey_issued: 카드 등록됨(결제 전), processing: 결제 중
  billing_key text,              -- 카드 등록 결과(복호화한 빌링키) — 가입 확정 때 billing_keys로 옮김
  card_label text,
  buyer_tel text,                -- 자동결제 승인에 필요한 연락처
  message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists billing_checkouts_user_idx on billing_checkouts (user_id, created_at desc);
alter table billing_checkouts enable row level security; -- 정책 없음: 서버 전용

-- ─────────────────────────────────────────────
-- 4. 결제 기록 — 첫 결제·자동갱신·실패·환불
-- ─────────────────────────────────────────────
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null, -- 탈퇴해도 결제 기록은 법령상 보관(전자상거래법 5년)
  plan_code text not null,
  kind text not null check (kind in ('first', 'renewal', 'onetime')),
  method text not null default 'billing' check (method in ('billing', 'onetime')), -- 어느 상점으로 결제했는지(환불할 때 씀)
  amount int not null,
  status text not null check (status in ('paid', 'failed', 'refunded', 'partially_refunded')),
  oid text not null unique,      -- 우리 주문번호(같은 주문이 두 번 결제되지 않게)
  tid text,                      -- 이니시스 거래번호(취소·환불에 씀)
  card_label text,
  message text,                  -- 실패·환불 사유
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  refunded_amount int not null default 0,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists payments_created_idx on payments (created_at desc);

alter table payments enable row level security;

drop policy if exists "payments_self_read" on payments;
create policy "payments_self_read" on payments for select using (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 5. 탈퇴(0025) — 결제 기록은 지우지 않고 남깁니다(위 user_id on delete set null).
--    해지 예약(cancel_at_period_end)만 걸린 구독은 탈퇴를 막지 않게 delete_my_account를 바꿉니다:
--    이용 중이라도 해지를 예약했으면 탈퇴할 수 있어요(남은 기간은 포기).
-- ─────────────────────────────────────────────
create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  if exists (select 1 from channel_members where user_id = uid and role = 'owner') then
    raise exception 'channel_owner';
  end if;

  if exists (
    select 1 from member_subscriptions
    where user_id = uid
      and status in ('active', 'trialing', 'past_due')
      and not cancel_at_period_end
  ) then
    raise exception 'active_subscription';
  end if;

  begin
    update storage.objects set owner = null, owner_id = null where owner = uid or owner_id = uid::text;
  exception when others then
    null;
  end;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
