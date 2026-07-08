import type Database from "better-sqlite3";

interface Migration {
  hash: string;
  createdAt: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    hash: "ec8e50823c5fa2dd3b73e7df6d3b59f794817cb5bb0f3b20fea859ee528e66d7",
    createdAt: 1782117446067,
    sql: `
CREATE TABLE \`agent_profiles\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`cli\` text NOT NULL,
  \`model\` text NOT NULL,
  \`reasoning\` text NOT NULL,
  \`skills\` text DEFAULT '[]' NOT NULL,
  \`system_prompt\` text DEFAULT '' NOT NULL,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`test_run_events\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  \`run_id\` text NOT NULL,
  \`seq\` integer NOT NULL,
  \`type\` text NOT NULL,
  \`payload\` text NOT NULL,
  \`at\` integer NOT NULL,
  FOREIGN KEY (\`run_id\`) REFERENCES \`test_runs\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`test_runs\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`scenario_id\` text,
  \`profile_id\` text,
  \`name\` text NOT NULL,
  \`build_path\` text NOT NULL,
  \`scenario\` text NOT NULL,
  \`cli\` text NOT NULL,
  \`model\` text NOT NULL,
  \`reasoning\` text NOT NULL,
  \`profile_name\` text DEFAULT '' NOT NULL,
  \`profile_skills\` text DEFAULT '[]' NOT NULL,
  \`profile_system_prompt\` text DEFAULT '' NOT NULL,
  \`devices\` text DEFAULT '[]' NOT NULL,
  \`status\` text DEFAULT 'queued' NOT NULL,
  \`result\` text,
  \`duration_ms\` integer,
  \`started_at\` integer,
  \`finished_at\` integer,
  \`created_at\` integer NOT NULL,
  FOREIGN KEY (\`scenario_id\`) REFERENCES \`test_scenarios\`(\`id\`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE \`test_scenarios\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`build_path\` text NOT NULL,
  \`profile_id\` text,
  \`prompt\` text NOT NULL,
  \`created_at\` integer NOT NULL,
  FOREIGN KEY (\`profile_id\`) REFERENCES \`agent_profiles\`(\`id\`) ON UPDATE no action ON DELETE set null
);
`,
  },
  {
    hash: "2215ec5a5d3e262a4af0a71abb94ae1ec0ba6f9fe65bbaf4b7ad9681edd3466a",
    createdAt: 1782165437822,
    sql: `
ALTER TABLE \`test_runs\` ADD \`physical_build_path\` text;
--> statement-breakpoint
ALTER TABLE \`test_runs\` ADD \`device_preference\` text DEFAULT 'simulator' NOT NULL;
--> statement-breakpoint
ALTER TABLE \`test_scenarios\` ADD \`physical_build_path\` text;
--> statement-breakpoint
ALTER TABLE \`test_scenarios\` ADD \`device_preference\` text DEFAULT 'simulator' NOT NULL;
`,
  },
  {
    hash: "54530d31da0105aa7ce3de5a3583417a7e89db2d9faa1050f10029d5d5583a6d",
    createdAt: 1782208128387,
    sql: "ALTER TABLE `test_runs` ADD `success_guide` text;",
  },
  {
    hash: "d33ba755ac57dc3da27724589b68a7cf9cdaccc6a40cefee76c42dfac5cf05de",
    createdAt: 1782727898069,
    sql: `
CREATE TABLE \`app_maps\` (
  \`build_key\` text PRIMARY KEY NOT NULL,
  \`app_map\` text DEFAULT '' NOT NULL,
  \`login_flow\` text,
  \`expected_slots\` text DEFAULT '[]' NOT NULL,
  \`model\` text DEFAULT '' NOT NULL,
  \`created_at\` integer NOT NULL
);
`,
  },
];

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at numeric
);
`);
  const applied = new Set(
    sqlite
      .prepare("SELECT hash FROM __drizzle_migrations")
      .all()
      .map((row) => String((row as { hash: unknown }).hash)),
  );
  const apply = sqlite.transaction((migration: Migration) => {
    for (const statement of statements(migration.sql)) sqlite.exec(statement);
    sqlite
      .prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      )
      .run(migration.hash, migration.createdAt);
  });
  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.hash)) apply(migration);
  }
}
