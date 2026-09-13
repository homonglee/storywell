import postgres from "postgres";
import type { StoryDatabase, StoredStatement, StoredResult } from "./runtime-types";

const schema = [
  "CREATE TABLE IF NOT EXISTS story_projects (id text PRIMARY KEY, owner_id text NOT NULL, title text NOT NULL, synopsis text NOT NULL, genre text NOT NULL, tone text NOT NULL, target_episodes integer NOT NULL DEFAULT 80, status text NOT NULL DEFAULT '설계 중', content text NOT NULL, created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text)",
  "CREATE INDEX IF NOT EXISTS idx_story_projects_owner_updated ON story_projects(owner_id, updated_at)",
  "CREATE TABLE IF NOT EXISTS story_generations (id text PRIMARY KEY, owner_id text NOT NULL, project_id text NOT NULL, action text NOT NULL, model text NOT NULL, input_summary text NOT NULL, output text NOT NULL, created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text)",
  "CREATE INDEX IF NOT EXISTS idx_story_generations_owner_project_created ON story_generations(owner_id, project_id, created_at)",
  "CREATE TABLE IF NOT EXISTS story_ai_progress (id text PRIMARY KEY, owner_id text NOT NULL, payload text NOT NULL, updated_at text NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_story_ai_progress_owner_updated ON story_ai_progress(owner_id, updated_at)",
];

export function postgresPlaceholders(sql: string) {
  let n = 0;
  // The application owns SQL; values always travel separately as bound parameters.
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, token => token === "?" ? "$" + ++n : token);
}
type QueryRows = Record<string, unknown>[] & { count?: number };
type Executor = (sql: string, args: unknown[]) => Promise<QueryRows>;
export class PostgresStatement implements StoredStatement {
  constructor(readonly sql: string, readonly args: unknown[], private execute: Executor) {}
  bind(...values: unknown[]) { return new PostgresStatement(this.sql, values, this.execute); }
  async all<T = Record<string, unknown>>(): Promise<StoredResult<T>> {
    const rows = await this.execute(this.sql, this.args);
    return { results: [...rows] as T[], meta: { changes: Number(rows.count ?? rows.length) } };
  }
  async first<T = Record<string, unknown>>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return this.all(); }
}

let cached: StoryDatabase | undefined;
export function postgresDatabase(): StoryDatabase | undefined {
  if (cached) return cached;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return undefined;
  const client = postgres(url, { max: 3, idle_timeout: 20, connect_timeout: 10, prepare: false, ssl: { rejectUnauthorized: true }, onnotice: () => {} });
  let ready: Promise<unknown> | undefined;
  const ensureReady = () => ready ??= client.begin(async tx => {
    await tx.unsafe("SELECT pg_advisory_xact_lock(83749120)");
    for (const statement of schema) await tx.unsafe(statement);
  }).catch(error => { ready = undefined; throw error; });
  const report = (error: unknown): never => {
    console.error("storywell_database_error", { code: (error as { code?: string })?.code ?? "DATABASE_ERROR" });
    throw new Error("작품 저장소에 연결하지 못했습니다. 데이터베이스 연결 설정을 확인해 주세요.");
  };
  const execute: Executor = async (sql, args) => {
    try {
      await ensureReady();
      return await client.unsafe(postgresPlaceholders(sql), args as postgres.ParameterOrJSON<never>[]) as QueryRows;
    } catch (error) { return report(error); }
  };
  cached = {
    prepare(sql) { return new PostgresStatement(sql, [], execute); },
    async batch(statements) {
      try {
        await ensureReady();
        const results = await client.begin(async tx => {
          const output: StoredResult[] = [];
          for (const statement of statements) {
            if (!(statement instanceof PostgresStatement)) throw new Error("Invalid statement");
            const rows = await tx.unsafe(postgresPlaceholders(statement.sql), statement.args as postgres.ParameterOrJSON<never>[]);
            output.push({ results: [...rows], meta: { changes: Number(rows.count) } });
          }
          return output;
        });
        return results as StoredResult[];
      } catch (error) { return report(error); }
    },
  };
  return cached;
}
