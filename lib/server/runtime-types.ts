export interface StoredResult<T = Record<string, unknown>> { results: T[]; meta: { changes: number }; }
export interface StoredStatement {
  bind(...values: unknown[]): StoredStatement;
  all<T = Record<string, unknown>>(): Promise<StoredResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<StoredResult>;
}
export interface StoryDatabase {
  prepare(sql: string): StoredStatement;
  batch(statements: StoredStatement[]): Promise<StoredResult[]>;
}
export interface RuntimeBindings {
  readonly DB?: StoryDatabase;
  readonly BUCKET?: R2Bucket;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly IS_VERCEL: boolean;
}
