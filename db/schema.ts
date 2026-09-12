import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const storyProjects = sqliteTable(
  "story_projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    synopsis: text("synopsis").notNull(),
    genre: text("genre").notNull(),
    tone: text("tone").notNull(),
    targetEpisodes: integer("target_episodes").notNull().default(80),
    status: text("status").notNull().default("설계 중"),
    content: text("content", { mode: "json" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_story_projects_owner_updated").on(table.ownerId, table.updatedAt)]
);

export const storyGenerations = sqliteTable(
  "story_generations",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull(),
    action: text("action").notNull(),
    model: text("model").notNull(),
    inputSummary: text("input_summary").notNull(),
    output: text("output").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_story_generations_owner_project_created").on(
      table.ownerId,
      table.projectId,
      table.createdAt
    ),
  ]
);
