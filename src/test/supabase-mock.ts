import { vi, type Mock } from "vitest";

/**
 * Lightweight chainable mock for the Supabase JS client used by
 * the Data API (PostgREST). Captures every chained call so tests can
 * assert which filters/orders/ranges were applied. Resolves to a
 * configurable `{ data, error, count }`.
 */
export type ChainCall = { method: string; args: unknown[] };

export interface MockResult<T = unknown> {
  data?: T | null;
  error?: { message: string } | null;
  count?: number | null;
}

export type QueryBuilder<T = unknown> = {
  calls: ChainCall[];
  _result: MockResult<T>;
  setResult: (r: MockResult<T>) => void;
  then: (resolve: (v: MockResult<T>) => unknown) => Promise<unknown>;
} & Record<string, Mock>;

export function createQueryBuilder<T = unknown>(
  result: MockResult<T> = { data: [] as unknown as T, error: null },
): QueryBuilder<T> {
  const calls: ChainCall[] = [];
  const builder = {
    calls,
    _result: result,
  } as QueryBuilder<T>;
  const chainable = [
    "select",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "is",
    "not",
    "or",
    "ilike",
    "like",
    "match",
    "order",
    "range",
    "limit",
    "single",
    "maybeSingle",
    "upsert",
    "insert",
    "update",
    "delete",
    "rpc",
    "filter",
    "contains",
    "containedBy",
    "overlaps",
    "textSearch",
  ];
  for (const m of chainable) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.then = (resolve: (v: MockResult<T>) => unknown) =>
    Promise.resolve(builder._result).then(resolve);
  builder.setResult = (r: MockResult<T>) => {
    builder._result = r;
  };
  return builder;
}

export interface ChannelMock {
  on: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
}

export function createSupabaseMock() {
  const builders: QueryBuilder[] = [];
  const channels: ChannelMock[] = [];
  const from = vi.fn((_table: string) => {
    const b = createQueryBuilder();
    builders.push(b);
    return b;
  });
  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  const channel = vi.fn((_name: string) => {
    const ch: ChannelMock = {
      on: vi.fn(() => ch),
      subscribe: vi.fn((cb?: (s: string) => void) => {
        cb?.("SUBSCRIBED");
        return ch;
      }),
      unsubscribe: vi.fn(),
    };
    channels.push(ch);
    return ch;
  });
  const removeChannel = vi.fn();
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  return {
    client: { from, auth, channel, removeChannel, rpc } as unknown as {
      from: typeof from;
      auth: typeof auth;
      channel: typeof channel;
      removeChannel: typeof removeChannel;
      rpc: typeof rpc;
    },
    builders,
    channels,
    from,
    auth,
    channel,
    removeChannel,
    rpc,
    lastBuilder: () => builders[builders.length - 1],
  };
}
