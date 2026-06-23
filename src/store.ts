import { Database } from "bun:sqlite";

export type Kind = "user" | "assistant" | "tool";
export type Recent = { id: string; title: string | null; updated_at: number };
export type Msg = { kind: Kind; data: any };

export class Store {
  private db: Database;

  constructor(path = process.env.STEAM_DB ?? "s-team.db") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS message (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         session_id TEXT NOT NULL,
         kind       TEXT NOT NULL,
         data       TEXT NOT NULL,
         created_at INTEGER NOT NULL
       );
       CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id, id);`,
    );
  }

  createSession(): string {
    return `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private record(sessionId: string, kind: Kind, data: unknown) {
    this.db
      .query("INSERT INTO message (session_id, kind, data, created_at) VALUES (?,?,?,?)")
      .run(sessionId, kind, JSON.stringify(data ?? {}), Date.now());
  }

  recordUser(sessionId: string, text: string) {
    this.record(sessionId, "user", { text });
  }
  recordAssistant(sessionId: string, text: string) {
    this.record(sessionId, "assistant", { text });
  }
  recordTool(sessionId: string, callId: string, name: string, args: string, result: unknown) {
    this.record(sessionId, "tool", { call_id: callId, name, arguments: args, result });
  }

  recents(limit = 8): Recent[] {
    const rows = this.db
      .query(
        `SELECT m.session_id AS id, MAX(m.created_at) AS updated_at,
                (SELECT u.data FROM message u WHERE u.session_id = m.session_id AND u.kind = 'user' ORDER BY u.id LIMIT 1) AS first_user
           FROM message m GROUP BY m.session_id ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as any[];
    return rows.map((r) => ({ id: r.id, updated_at: r.updated_at, title: titleOf(r.first_user) }));
  }

  load(sessionId: string, limit = 60): Msg[] {
    const rows = this.db
      .query("SELECT kind, data FROM message WHERE session_id = ? ORDER BY id DESC LIMIT ?")
      .all(sessionId, limit) as any[];
    const msgs: Msg[] = [];
    for (const r of rows) {
      try {
        msgs.push({ kind: r.kind as Kind, data: JSON.parse(r.data) });
      } catch {}
    }
    msgs.reverse();
    return msgs;
  }

  close() {
    this.db.close();
  }
}

function titleOf(firstUser: string | null): string | null {
  if (!firstUser) return null;
  let text: string;
  try {
    text = String(JSON.parse(firstUser).text ?? "");
  } catch {
    return null;
  }
  const t = Array.from(text.trim().replace(/\s+/g, " ")).slice(0, 60).join("");
  return t || null;
}
