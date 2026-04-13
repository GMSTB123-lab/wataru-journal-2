// api/db.js — Turso データベース プロキシ
// Tursoの libsql HTTP APIを使ってデータを読み書きします

const TURSO_URL = process.env.TURSO_URL; libsql: wataru-journal-wataru303148.aws-ap-northeast-1.turso.io    // 例: libsql://your-db.turso.io
const TURSO_TOKEN = process.env.TURSO_TOKEN; eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzYwNDU5NzEsImlkIjoiMDE5ZDg0OTUtZjQwMS03YTViLThlNDEtMzZhMjBkM2VkNmE1IiwicmlkIjoiNTZjYzk0NGEtZmY4Yy00MDQxLWI1OTctMWNkMDk2NTFmODE3In0.EsrSfWWXG5HgU-CYFVEfT5sGHNpHIqoAr9Qlxkx6TN8zrCz6KWQu-d6JjV1PFR0eAa6UMqc6tG7BAuxiTqyZAA // Turso auth token

async function turso(sql, args = []) {
  const url = TURSO_URL.replace('libsql://', 'https://');
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args: args.map(v => ({ type: 'text', value: String(v) })) } }, { type: 'close' }]
    })
  });
  if (!res.ok) throw new Error(`Turso error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result;
}

async function initTables() {
  await turso(`CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'wataru',
    created_at TEXT NOT NULL,
    fields TEXT NOT NULL DEFAULT '{}',
    summary TEXT DEFAULT ''
  )`);
  await turso(`CREATE TABLE IF NOT EXISTS app_state (
    user_id TEXT PRIMARY KEY,
    insights_cache TEXT DEFAULT '',
    monthly_summaries TEXT DEFAULT '{}'
  )`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Turso未設定の場合は404を返してフロントエンドがlocalStorageにフォールバック
  if (!TURSO_URL || !TURSO_TOKEN) return res.status(404).json({ error: 'DB not configured' });

  try {
    await initTables();

    // GET: エントリー一覧 + アプリ状態を取得
    if (req.method === 'GET') {
      const rows = await turso(`SELECT id, created_at, fields, summary FROM journal_entries WHERE user_id='wataru' ORDER BY created_at DESC LIMIT 3000`);
      const entries = (rows?.rows || []).map(r => ({
        id: r[0], date: r[1], fields: JSON.parse(r[2] || '{}'), summary: r[3] || ''
      }));
      const stateRows = await turso(`SELECT insights_cache, monthly_summaries FROM app_state WHERE user_id='wataru'`);
      const stateRow = stateRows?.rows?.[0];
      return res.status(200).json({
        entries,
        insightsCache: stateRow?.[0] || '',
        monthlySummaries: JSON.parse(stateRow?.[1] || '{}'),
      });
    }

    // POST
    if (req.method === 'POST') {
      const { action, entry, insightsCache, monthlySummaries } = req.body;

      if (action === 'add_entry') {
        await turso(
          `INSERT OR REPLACE INTO journal_entries (id, user_id, created_at, fields, summary) VALUES (?,?,?,?,?)`,
          [entry.id, 'wataru', entry.date, JSON.stringify(entry.fields), entry.summary || '']
        );
        return res.status(200).json({ ok: true });
      }

      if (action === 'save_state') {
        await turso(
          `INSERT OR REPLACE INTO app_state (user_id, insights_cache, monthly_summaries) VALUES ('wataru',?,?)`,
          [insightsCache || '', JSON.stringify(monthlySummaries || {})]
        );
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('DB error:', e);
    return res.status(500).json({ error: e.message });
  }
}
