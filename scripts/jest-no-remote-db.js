// Tests build their own throwaway SQLite files. With Turso credentials in
// the environment, libsql-connection.ts would send those same queries to
// the real database instead — so tests never see them, whatever the shell
// has set.
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
