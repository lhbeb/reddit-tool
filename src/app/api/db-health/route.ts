import { NextResponse } from "next/server";

const REQUIRED_TABLES = ["team_members", "reddit_posts", "reddit_comments", "post_history"];
const REQUIRED_BUCKETS = ["reddit-assets", "assignment-exports"];
const REQUIRED_STATUS_VALUES = ["queued", "working", "done", "rejected", "removed", "cancelled"];
const RPC_MISSING = "rpc:reddit_assignment_health";
const RPC_OUTDATED = "rpc:reddit_assignment_health_outdated";
const REQUIRED_COLUMNS = [
  "reddit_posts.soft_deleted",
  "reddit_posts.deleted_at",
  "reddit_posts.deleted_by",
  "reddit_posts.rejection_reason",
  "reddit_posts.assigned_at",
  "reddit_comments.parent_id",
  "reddit_comments.is_ai_draft",
  "reddit_comments.posted_url",
  "reddit_comments.assigned_at",
];

type CheckResult = {
  ok: boolean;
  details: Record<string, unknown>;
  missing: string[];
};

function getSupabaseConfig() {
  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const { anonKey, serviceRoleKey, url } = getSupabaseConfig();
  const key = serviceRoleKey || anonKey;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function checkHealthRpc(): Promise<CheckResult> {
  const response = await supabaseFetch("/rest/v1/rpc/reddit_assignment_health", {
    method: "POST",
    body: "{}",
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      details: {
        status: response.status,
        text: await response.text(),
      },
      missing: [RPC_MISSING],
    };
  }

  const details = (await response.json()) as Record<string, unknown>;
  const tables = details.tables as Record<string, boolean> | undefined;
  const buckets = details.buckets as Record<string, boolean> | undefined;
  const columns = details.columns as Record<string, boolean> | undefined;
  const enumValues = details.enum_values as Record<string, string[]> | undefined;
  const taskStatuses = new Set(enumValues?.task_status ?? []);
  const hasLifecycleShape = Boolean(columns && enumValues?.task_status);
  const missing = [
    ...(!hasLifecycleShape ? [RPC_OUTDATED] : []),
    ...REQUIRED_TABLES.filter((table) => !tables?.[table]),
    ...(hasLifecycleShape ? REQUIRED_COLUMNS.filter((column) => !columns?.[column]) : []),
    ...(hasLifecycleShape
      ? REQUIRED_STATUS_VALUES.filter((status) => !taskStatuses.has(status)).map(
          (status) => `task_status:${status}`,
        )
      : []),
    ...REQUIRED_BUCKETS.filter((bucket) => {
      const key = bucket.replace("-", "_");
      return !buckets?.[key];
    }),
  ];

  return {
    ok: missing.length === 0,
    details,
    missing,
  };
}

async function checkRestFallback(): Promise<CheckResult> {
  const tableResults = await Promise.all(
    REQUIRED_TABLES.map(async (table) => {
      const response = await supabaseFetch(`/rest/v1/${table}?select=id&limit=1`, {
        cache: "no-store",
        headers: { prefer: "count=exact" },
      });

      return [table, response.ok] as const;
    }),
  );
  const columnResults = await Promise.all(
    REQUIRED_COLUMNS.map(async (column) => {
      const [table = "", field = ""] = column.split(".");
      const response = await supabaseFetch(`/rest/v1/${table}?select=id,${field}&limit=1`, {
        cache: "no-store",
      });

      return [column, response.ok] as const;
    }),
  );

  const bucketResponse = await supabaseFetch("/storage/v1/bucket", {
    cache: "no-store",
  });
  const buckets = bucketResponse.ok
    ? ((await bucketResponse.json()) as Array<{ id?: string; name?: string }>)
    : [];
  const bucketIds = new Set(buckets.map((bucket) => bucket.id || bucket.name));
  const tableMap = Object.fromEntries(tableResults);
  const bucketMap = Object.fromEntries(
    REQUIRED_BUCKETS.map((bucket) => [bucket, bucketIds.has(bucket)]),
  );
  const columnMap = Object.fromEntries(columnResults);
  const missing = [
    ...REQUIRED_TABLES.filter((table) => !tableMap[table]),
    ...REQUIRED_COLUMNS.filter((column) => !columnMap[column]),
    ...REQUIRED_BUCKETS.filter((bucket) => !bucketMap[bucket]),
  ];

  return {
    ok: missing.length === 0,
    details: {
      tables: tableMap,
      columns: columnMap,
      buckets: bucketMap,
      bucketStatus: bucketResponse.status,
    },
    missing,
  };
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    let result = await checkHealthRpc();

    const shouldUseFallback =
      result.missing.includes(RPC_MISSING) || result.missing.includes(RPC_OUTDATED);

    if (!result.ok && shouldUseFallback) {
      const fallback = await checkRestFallback();
      const rpcMissing = result.missing.filter((item) => item.startsWith("rpc:"));
      const missing = Array.from(new Set([...rpcMissing, ...fallback.missing]));

      result = {
        ok: missing.length === 0,
        details: {
          rpc: result.details,
          fallback: fallback.details,
        },
        missing,
      };
    }

    const payload = {
      checkedAt,
      ok: result.ok,
      missing: result.missing,
      details: result.details,
    };

    console.log("[db-health]", JSON.stringify(payload));

    return NextResponse.json(payload, {
      status: result.ok ? 200 : 503,
    });
  } catch (error) {
    const payload = {
      checkedAt,
      ok: false,
      missing: ["supabase_connection"],
      error: error instanceof Error ? error.message : "Unknown health check error",
    };

    console.error("[db-health]", JSON.stringify(payload));

    return NextResponse.json(payload, { status: 500 });
  }
}
