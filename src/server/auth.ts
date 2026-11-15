import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { username } from "better-auth/plugins/username";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const localURL = new URL(baseURL);
const alternateHost = localURL.hostname === "localhost" ? "127.0.0.1" : "localhost";
const alternateOrigin = localURL.hostname === "localhost" || localURL.hostname === "127.0.0.1"
  ? `${localURL.protocol}//${alternateHost}${localURL.port ? ":" + localURL.port : ""}`
  : null;
export const trustedOrigins = [localURL.origin, ...(alternateOrigin ? [alternateOrigin] : [])];

async function configureAuth() {
  // Route handlers can initialize independently. PostgreSQL serializes migrations and demo setup.
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(81463219)");
    const auth = await initializeAuth();
    await connection.query("COMMIT");
    return auth;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function initializeAuth() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_shift_settings (
      key text PRIMARY KEY,
      value text NOT NULL
    )
  `);
  let secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    await pool.query("INSERT INTO field_shift_settings VALUES ('session-secret', $1) ON CONFLICT DO NOTHING", [randomBytes(32).toString("base64url")]);
    secret = (await pool.query<{ value: string }>("SELECT value FROM field_shift_settings WHERE key = 'session-secret'")).rows[0].value;
  }

  const options = {
    appName: "Yaku",
    database: pool,
    baseURL,
    trustedOrigins,
    secret,
    emailAndPassword: { enabled: true },
    plugins: [username()],
  };
  const auth = betterAuth(options);
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_shift_drafts (
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      parcel_id text NOT NULL DEFAULT 'default',
      draft jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, parcel_id)
    );
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'field_shift_drafts' AND column_name = 'parcel_id'
      ) THEN
        ALTER TABLE field_shift_drafts
          ADD COLUMN parcel_id text NOT NULL DEFAULT 'default',
          DROP CONSTRAINT field_shift_drafts_pkey,
          ADD PRIMARY KEY (user_id, parcel_id);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_shift_inspection_deliveries (
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      parcel_id text NOT NULL,
      local_day date NOT NULL,
      recipient text NOT NULL CHECK (recipient IN ('regantes', 'gamc')),
      status text NOT NULL CHECK (status IN ('sending', 'failed', 'accepted')),
      attempt_id uuid NOT NULL,
      attempted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, parcel_id, local_day, recipient)
    );
  `);

  const password = process.env.FIELD_SHIFT_DEMO_PASSWORD;
  if (password && process.env.FIELD_SHIFT_DEMO_ENABLED === "true") {
    const demoUsername = "prueba";
    const demoName = "Luis";
    const existing = await pool.query<{ name: string; email: string }>('SELECT name, email FROM "user" WHERE username = $1', [demoUsername]);
    if (!existing.rowCount) {
      const setup = betterAuth({
        ...options,
        emailAndPassword: { enabled: true, autoSignIn: false },
      });
      const body = { username: demoUsername, email: "prueba@field-shift.test", password, name: demoName };
      await setup.api.signUpEmail({ body });
    } else if (existing.rows[0].name === "Prueba" && existing.rows[0].email === "prueba@field-shift.test") {
      await pool.query('UPDATE "user" SET name = $1, "updatedAt" = now() WHERE username = $2 AND email = $3 AND name = $4',
        [demoName, demoUsername, "prueba@field-shift.test", "Prueba"]);
    }
  }
  return auth;
}

let initialization: ReturnType<typeof configureAuth> | undefined;

export function getAuth() {
  if (!process.env.DATABASE_URL) return Promise.resolve(null);
  initialization ??= configureAuth().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
