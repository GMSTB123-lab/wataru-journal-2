// api/claude.js — Anthropic API プロキシ (Vercel Serverless Function)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; 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
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY が未設定です。Vercelの環境変数を確認してください。' });
  }

  try {
    const { system, messages } = req.body;

    // バリデーション: messages が配列であること・空でないこと・最後がuserであること
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages は空でない配列である必要があります' });
    }
    if (messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'messagesの最後のエントリーはrole:userである必要があります' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: system || '',
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const text = data.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || '';

    return res.status(200).json({ text });
  } catch (e) {
    console.error('Claude proxy error:', e);
    return res.status(500).json({ error: e.message });
  }
}
