// Talks to the sandbox chat as one customer, for scripted or agent-driven
// conversation tests. State (cookie, conversation) is kept per session name.
//   node scripts/chat-session.mjs <session> say "<message>"
//   node scripts/chat-session.mjs <session> memo [waitSeconds]   staff research notes
//   node scripts/chat-session.mjs <session> transcript
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.env.LIVE_AI_ROOT || '.data/verification/chat-quality-2026-10-12');
const baseURL = process.env.LIVE_AI_TEST_URL || 'http://localhost:3212';
const [session, command, ...rest] = process.argv.slice(2);
if (!session || !/^[\w-]+$/.test(session) || !['say', 'memo', 'transcript'].includes(command))
  throw Error('Use <session> say "<message>" | memo [seconds] | transcript');
const dir = join(root, 'sessions');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${session}.json`);
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { cookie: '' };
const database = () => new Database(join(root, 'sandbox', 'aokienji.sqlite'), { readonly: true });

if (command === 'say') {
  const message = rest.join(' ').trim();
  if (!message) throw Error('message required');
  const start = Date.now();
  const response = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: {
      Origin: baseURL,
      'Content-Type': 'application/json',
      ...(state.cookie ? { Cookie: state.cookie } : {}),
    },
    body: JSON.stringify({
      message,
      ...(state.conversationId ? { conversationId: state.conversationId } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) state.cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const body = await response.json();
  if (!response.ok) {
    console.log(`エラー ${response.status}: ${body.error?.message || ''}`);
    process.exit(1);
  }
  const { conversationId, message: reply } = body.data;
  state.conversationId = conversationId;
  writeFileSync(file, JSON.stringify(state));
  const button =
    reply.handoff === 'quote'
      ? '［ボタン: この内容で見積を依頼する］'
      : reply.handoff === 'inquiry'
        ? '［ボタン: この内容で担当者に相談する］'
        : '';
  console.log(reply.content);
  if (button) console.log(button);
  if (reply.suggestions?.length) console.log(`［質問候補: ${reply.suggestions.join(' / ')}］`);
  console.log(
    `（応答 ${Date.now() - start}ms・作成 ${reply.responseProvider === 'openai' ? 'OpenAI' : 'アプリ'}・振り分け ${reply.route}）`,
  );
} else if (command === 'memo') {
  if (!state.conversationId) throw Error('no conversation yet');
  const wait = Math.min(Number(rest[0] || 60), 180) * 1000;
  const until = Date.now() + wait;
  let notes = [];
  for (;;) {
    const db = database();
    notes = db
      .prepare('SELECT json FROM research_notes WHERE conversation_id=? ORDER BY created_at')
      .all(state.conversationId)
      .map((r) => JSON.parse(r.json));
    db.close();
    // Research starts after the reply, so wait a little even when none exists.
    const settled = notes.length
      ? notes.every((n) => n.status !== 'running')
      : Date.now() > until - wait + 20000;
    if (settled || Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!notes.length)
    console.log('AI調査メモはありません（調査不要と判定された、または調査対象外）。');
  for (const n of notes) {
    console.log(`■ ${n.subject}`);
    console.log(
      `  状態: ${n.status}・判定: ${n.decidedBy}・項目: ${n.aspects.join(',')}${n.destination ? `・お届け先: ${n.destination}` : ''}${n.quantity ? `・数量: ${n.quantity}` : ''}`,
    );
    if (n.summary) console.log(`  要約: ${n.summary.replace(/\n/g, ' ')}`);
    for (const f of n.findings)
      console.log(
        `  - [${f.aspect}] ${f.value}｜${f.supplierName ? `仕入先:${f.supplierName}` : f.title}｜${f.url}｜${{ matched: 'ページで確認済み', partial: '一部のみ確認', mismatch: 'ページの記載と不一致', unreachable: '自動取得できず未確認' }[f.check]}${f.itemOnPage === false ? '（別の型式・サイズの可能性）' : ''}｜一致${f.relevance ?? '-'}${f.note ? `｜${f.note}` : ''}`,
      );
  }
} else {
  if (!state.conversationId) throw Error('no conversation yet');
  const db = database();
  const messages = db
    .prepare('SELECT json FROM messages WHERE conversation_id=?')
    .all(state.conversationId)
    .map((r) => JSON.parse(r.json))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  db.close();
  for (const m of messages)
    console.log(`${m.role === 'user' ? 'お客様' : 'チャット'}: ${m.content}\n`);
}
