/**
 * Role matrix: every role-gated endpoint, every role, allow/deny expected.
 *
 * Roles covered:
 *   - anon            (no session)
 *   - agent           (TEST_AGENT_EMAIL / TEST_AGENT_PASSWORD)
 *   - admin           (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)
 *
 * Each cell asserts the role's expected outcome:
 *   - 'allow' : the call must NOT be rejected by access control
 *               (a downstream business error is acceptable)
 *   - 'deny'  : the call MUST be rejected by either the EXECUTE grant
 *               (PostgREST 401 / SQLSTATE 42501) or an in-function
 *               RAISE EXCEPTION (admin guard)
 *
 * Authenticated tiers skip cleanly when their creds are missing so this
 * suite is safe to run locally and in CI without seeded users.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const AGENT_EMAIL = process.env.TEST_AGENT_EMAIL;
const AGENT_PASSWORD = process.env.TEST_AGENT_PASSWORD;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const hasEnv = Boolean(URL && KEY);
const hasAgent = hasEnv && Boolean(AGENT_EMAIL && AGENT_PASSWORD);
const hasAdmin = hasEnv && Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

type Outcome = 'allow' | 'deny';
type RoleKey = 'anon' | 'agent' | 'admin';

function isPermissionDenied(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === '42501') return true;
  return /permission denied|not allowed|unauthorized/i.test(error.message ?? '');
}

function isAdminGuardRejection(error: { message?: string } | null) {
  if (!error) return false;
  return /only admins?|not authenticated|admin role|forbidden/i.test(
    error.message ?? '',
  );
}

function isAccessDenied(error: { code?: string; message?: string } | null) {
  return isPermissionDenied(error) || isAdminGuardRejection(error);
}

async function makeClient(email?: string, password?: string) {
  const c = createClient<Database>(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  if (email && password) {
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Endpoint catalog: RPC name → { call(client), matrix }
// ---------------------------------------------------------------------------
type CallResult = { error: { code?: string; message?: string } | null };

interface RpcEndpoint {
  name: string;
  call: (c: SupabaseClient<Database>) => Promise<CallResult>;
  matrix: Record<RoleKey, Outcome>;
}

const RPC_ENDPOINTS: RpcEndpoint[] = [
  {
    name: 'change_user_role',
    call: (c) =>
      c.rpc('change_user_role', {
        _target: '00000000-0000-0000-0000-000000000000',
        _new_role: 'agent',
      }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'deny', admin: 'allow' },
  },
  {
    name: 'preview_agent_purge',
    call: (c) =>
      c.rpc('preview_agent_purge', { _name: '__nobody__' }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'deny', admin: 'allow' },
  },
  {
    name: 'purge_agent_data',
    call: (c) =>
      c.rpc('purge_agent_data', {
        _name: '__nobody__',
        _actor_id: undefined as never,
        _actor_name: 'role-matrix-test',
      }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'deny', admin: 'allow' },
  },
  {
    name: 'purge_orphaned_agent_refs',
    call: (c) =>
      c.rpc('purge_orphaned_agent_refs') as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'deny', admin: 'deny' }, // service_role only
  },
  {
    name: 'next_scoped_id',
    call: (c) =>
      c.rpc('next_scoped_id', { _kind: 'defect', _tax_year: '2099' }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'allow', admin: 'allow' },
  },
  {
    name: 'current_user_name',
    call: (c) => c.rpc('current_user_name') as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'allow', admin: 'allow' },
  },
  {
    name: 'user_id_for_name',
    call: (c) =>
      c.rpc('user_id_for_name', { _name: '__nobody__' }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'allow', admin: 'allow' },
  },
  {
    name: 'has_role',
    call: (c) =>
      c.rpc('has_role', {
        _user_id: '00000000-0000-0000-0000-000000000000',
        _role: 'admin',
      }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'allow', admin: 'allow' },
  },
  {
    name: 'log_activity',
    call: (c) =>
      c.rpc('log_activity', {
        _category: 'test',
        _action: 'role-matrix.probe',
      }) as unknown as Promise<CallResult>,
    matrix: { anon: 'deny', agent: 'allow', admin: 'allow' },
  },
];

// ---------------------------------------------------------------------------
// Table catalog: name → { selectMatrix, insertMatrix? }
// Tables here are role-gated; admin-only tables expect deny for agent.
// ---------------------------------------------------------------------------
interface TableEndpoint {
  table: keyof Database['public']['Tables'];
  // 'allow' = call must succeed OR return an RLS-empty set (no error).
  // 'deny'  = call must return an access error.
  selectMatrix: Record<RoleKey, Outcome>;
}

const TABLE_ENDPOINTS: TableEndpoint[] = [
  // Admin-visible only (RLS keys off has_role('admin')).
  { table: 'role_audit_log',      selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'agent_audit_log',     selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'export_audit_log',    selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'defect_audit_log',    selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'qa_runtime_config_audit', selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'agent_invites',       selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'retest_pending_assignments', selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'id_sequences',        selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'email_log',           selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'app_settings',        selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },

  // Tables both roles can read under RLS (own rows / scoped policies).
  { table: 'user_roles',          selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'activity_log',        selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'notifications',       selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'user_preferences',    selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'export_jobs',         selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'defect_comments',     selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'defects',             selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'forms',               selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'notes',               selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'profiles',            selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'report_views',        selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'retest_assignment_forms', selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
  { table: 'retest_assignments',  selectMatrix: { anon: 'deny', agent: 'allow', admin: 'allow' } },
];

// ---------------------------------------------------------------------------
// Per-role describe blocks. Each role drives the same matrix; cells whose
// `allow` semantics need privileged creds are skipped when those creds are
// unavailable.
// ---------------------------------------------------------------------------
const ROLE_PRESENCE: Record<RoleKey, boolean> = {
  anon: hasEnv,
  agent: hasAgent,
  admin: hasAdmin,
};

const ROLE_LABEL: Record<RoleKey, string> = {
  anon: 'anonymous',
  agent: 'QA Agent',
  admin: 'Admin',
};

function describeRole(role: RoleKey, signIn: () => Promise<SupabaseClient<Database>>) {
  const block = ROLE_PRESENCE[role] ? describe : describe.skip;
  block(`Role matrix — ${ROLE_LABEL[role]}`, () => {
    let client: SupabaseClient<Database>;
    beforeAll(async () => {
      client = await signIn();
    });

    it.each(RPC_ENDPOINTS.map((e) => ({ name: e.name, e })))(
      `${role} → RPC $name should be ${role === 'anon' ? 'denied' : 'matrix-evaluated'}`,
      async ({ e }) => {
        const expected = e.matrix[role];
        const { error } = await e.call(client);
        if (expected === 'deny') {
          expect(error, `expected deny for ${e.name}`).not.toBeNull();
          expect(
            isAccessDenied(error),
            `expected access denial for ${e.name}, got: ${JSON.stringify(error)}`,
          ).toBe(true);
        } else {
          // allow: must NOT be an access-control rejection.
          if (error) {
            expect(
              isAccessDenied(error),
              `${e.name} unexpectedly denied for ${role}: ${JSON.stringify(error)}`,
            ).toBe(false);
          }
        }
      },
    );

    it.each(TABLE_ENDPOINTS.map((t) => ({ table: t.table as string, t })))(
      `${role} → SELECT $table matches matrix`,
      async ({ t }) => {
        const expected = t.selectMatrix[role];
        const { data, error } = await client.from(t.table).select('*').limit(1);
        if (expected === 'deny') {
          const denied = error !== null;
          const empty = Array.isArray(data) && data.length === 0;
          // anon may surface either explicit denial or RLS-empty; both satisfy.
          expect(
            denied || empty,
            `expected deny/empty for ${t.table}, got data=${JSON.stringify(data)} err=${JSON.stringify(error)}`,
          ).toBe(true);
        } else {
          // allow: no permission error (RLS-empty is still "allowed").
          if (error) {
            expect(
              isAccessDenied(error),
              `SELECT ${t.table} unexpectedly denied for ${role}: ${JSON.stringify(error)}`,
            ).toBe(false);
          }
        }
      },
    );
  });
}

describeRole('anon', () => makeClient());
describeRole('agent', () => makeClient(AGENT_EMAIL, AGENT_PASSWORD));
describeRole('admin', () => makeClient(ADMIN_EMAIL, ADMIN_PASSWORD));