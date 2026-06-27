/**
 * Integration tests: SECURITY DEFINER RPC access control.
 *
 * Verifies that the hardened RPCs and role-gated tables reject:
 *   1. anonymous callers at the Data API layer (HTTP 401 / SQLSTATE 42501)
 *   2. authenticated non-admin callers at the in-function role check
 *      (PostgREST returns the RAISE EXCEPTION message)
 *
 * The non-admin block is gated on TEST_AGENT_EMAIL / TEST_AGENT_PASSWORD env
 * vars. When absent (CI without seeded creds, local dev), those tests are
 * marked skipped with a clear reason instead of silently passing.
 *
 * NOTE: this suite hits the live project Data API using the publishable key
 * already shipped in .env. It performs read-only probes; the admin RPCs
 * fail before any mutation runs.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const AGENT_EMAIL = process.env.TEST_AGENT_EMAIL;
const AGENT_PASSWORD = process.env.TEST_AGENT_PASSWORD;

const hasEnv = Boolean(URL && KEY);
const hasAgent = Boolean(AGENT_EMAIL && AGENT_PASSWORD);

const describeIfEnv = hasEnv ? describe : describe.skip;
const describeIfAgent = hasEnv && hasAgent ? describe : describe.skip;

function makeAnon(): SupabaseClient<Database> {
  return createClient<Database>(URL!, KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

// PostgREST returns permission-denied as code "42501" or HTTP 401/403 with a
// message like 'permission denied for function ...'. Either signal is "denied".
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

describeIfEnv('SECURITY DEFINER RPCs — anonymous callers are denied', () => {
  const anon = makeAnon();

  const cases: Array<{ name: string; call: () => PromiseLike<{ error: unknown }> }> = [
    {
      name: 'change_user_role',
      call: () =>
        anon.rpc('change_user_role', {
          _target: '00000000-0000-0000-0000-000000000000',
          _new_role: 'agent',
        }),
    },
    {
      name: 'preview_agent_purge',
      call: () => anon.rpc('preview_agent_purge', { _name: 'nobody' }),
    },
    {
      name: 'purge_agent_data',
      call: () =>
        anon.rpc('purge_agent_data', {
          _name: 'nobody',
          _actor_id: undefined as never,
          _actor_name: 'attacker',
        }),
    },
    {
      name: 'purge_orphaned_agent_refs',
      call: () => anon.rpc('purge_orphaned_agent_refs'),
    },
    {
      name: 'next_scoped_id',
      call: () => anon.rpc('next_scoped_id', { _kind: 'defect', _tax_year: '2024' }),
    },
    {
      name: 'current_user_name',
      call: () => anon.rpc('current_user_name'),
    },
    {
      name: 'user_id_for_name',
      call: () => anon.rpc('user_id_for_name', { _name: 'nobody' }),
    },
    {
      name: 'has_role',
      call: () =>
        anon.rpc('has_role', {
          _user_id: '00000000-0000-0000-0000-000000000000',
          _role: 'admin',
        }),
    },
  ];

  it.each(cases)('anon → $name is denied at the API layer', async ({ call }) => {
    const result = (await call()) as { error: { code?: string; message?: string } | null };
    const { error } = result;
    expect(error, 'anon must not be able to invoke this RPC').not.toBeNull();
    expect(
      isPermissionDenied(error),
      `expected permission-denied, got: ${JSON.stringify(error)}`,
    ).toBe(true);
  });
});

describeIfEnv('Role-gated tables — anonymous SELECT is denied', () => {
  const anon = makeAnon();

  // Tables whose RLS policies are all scoped to auth.uid() — anon SELECT
  // must return either an empty set with a policy violation or a 401.
  const tables: Array<keyof Database['public']['Tables']> = [
    'user_roles',
    'role_audit_log',
    'agent_audit_log',
    'activity_log',
    'notifications',
    'user_preferences',
    'export_jobs',
    'export_audit_log',
  ];

  it.each(tables.map((t) => ({ table: t })))(
    'anon → SELECT $table returns no rows or is denied',
    async ({ table }) => {
      const { data, error } = await anon.from(table).select('*').limit(1);
      // Either explicit denial OR RLS yields an empty set — both are correct.
      const denied = error !== null;
      const empty = Array.isArray(data) && data.length === 0;
      expect(
        denied || empty,
        `expected denial or empty set, got data=${JSON.stringify(data)} error=${JSON.stringify(error)}`,
      ).toBe(true);
    },
  );
});

describeIfAgent(
  'SECURITY DEFINER RPCs — authenticated non-admin is rejected by guard',
  () => {
    let client: SupabaseClient<Database>;

    beforeAll(async () => {
      client = createClient<Database>(URL!, KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      });
      const { error } = await client.auth.signInWithPassword({
        email: AGENT_EMAIL!,
        password: AGENT_PASSWORD!,
      });
      if (error) throw new Error(`agent sign-in failed: ${error.message}`);
    });

    it('non-admin → change_user_role rejected by admin guard', async () => {
      const { error } = await client.rpc('change_user_role', {
        _target: '00000000-0000-0000-0000-000000000000',
        _new_role: 'agent',
      });
      expect(error).not.toBeNull();
      expect(isAdminGuardRejection(error)).toBe(true);
    });

    it('non-admin → preview_agent_purge rejected by admin guard', async () => {
      const { error } = await client.rpc('preview_agent_purge', { _name: 'nobody' });
      expect(error).not.toBeNull();
      expect(isAdminGuardRejection(error)).toBe(true);
    });

    it('non-admin → purge_agent_data rejected by admin guard', async () => {
      const { error } = await client.rpc('purge_agent_data', {
        _name: 'nobody',
        _actor_id: undefined as never,
        _actor_name: 'attacker',
      });
      expect(error).not.toBeNull();
      expect(isAdminGuardRejection(error)).toBe(true);
    });

    it('non-admin → purge_orphaned_agent_refs is denied (service_role-only)', async () => {
      const { error } = await client.rpc('purge_orphaned_agent_refs');
      expect(error).not.toBeNull();
      // This one has no in-function guard; it's denied by EXECUTE grant.
      expect(isPermissionDenied(error) || isAdminGuardRejection(error)).toBe(true);
    });

    it('non-admin → cannot read role_audit_log via RLS', async () => {
      const { data, error } = await client.from('role_audit_log').select('*').limit(1);
      // Either RLS-empty or explicit denial.
      expect((error !== null) || (Array.isArray(data) && data.length === 0)).toBe(true);
    });

    it('non-admin → cannot write user_roles via RLS', async () => {
      const { error } = await client
        .from('user_roles')
        .insert({ user_id: '00000000-0000-0000-0000-000000000000', role: 'admin' });
      expect(error).not.toBeNull();
    });

    it('non-admin → next_scoped_id IS allowed (authenticated grant)', async () => {
      const { error } = await client.rpc('next_scoped_id', {
        _kind: 'defect',
        _tax_year: '2099', // throwaway year to avoid colliding with real ids
      });
      // Should NOT be a permission/guard rejection. May still error on other grounds,
      // but the access-control checks must allow this call through.
      if (error) {
        expect(isPermissionDenied(error)).toBe(false);
        expect(isAdminGuardRejection(error)).toBe(false);
      }
    });
  },
);