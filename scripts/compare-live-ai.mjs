import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Offline comparison only: does not send requests, recreate databases, or read API keys.
const root = resolve('.data/verification/live-ai-2026-10-07');
const runName = process.argv[2] || 'jev-retest';
assert.ok(/^[\w-]+$/.test(runName), 'invalid run name');
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const labels = { adequate: '良好', partial: '一部不足', needsImprovement: '改善必要' };
const scores = { adequate: 2, partial: 1, needsImprovement: 0 };
const agents = [
  ['technical', '技術相談'],
  ['conversation', '会話の継続'],
  ['privacy-orders', '非公開・手続き'],
];
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const rows = [];
const baseline = read('extra-summary.json');
for (const [agent, perspective] of agents) {
  const before = read(`${agent}-extra-results.json`);
  const after = read(`${agent}-${runName}-results.json`);
  const ratings = read(`${agent}-${runName}-ratings.json`);
  assert.equal(before.scenarios.length, after.scenarios.length);
  const gradeMap = new Map(ratings.map((r) => [`${r.scenarioId}:${r.turn}`, r]));
  assert.equal(gradeMap.size, ratings.length, 'duplicate ratings');
  let questionCount = 0;
  before.scenarios.forEach((scenario, index) => {
    const current = after.scenarios[index];
    assert.equal(scenario.id, current.id);
    assert.equal(scenario.turns.length, current.turns.length);
    scenario.turns.forEach((oldTurn, turnIndex) => {
      const newTurn = current.turns[turnIndex];
      assert.equal(oldTurn.question, newTurn.question, 'questions must be identical');
      assert.equal(oldTurn.expected, newTurn.expected);
      assert.ok(oldTurn.response && newTurn.response, 'complete customer response required');
      const rating = gradeMap.get(`${scenario.id}:${turnIndex + 1}`);
      assert.ok(rating && rating.before in scores && rating.after in scores);
      const delta = scores[rating.after] - scores[rating.before];
      rows.push({
        agent,
        perspective,
        scenarioId: scenario.id,
        title: scenario.title,
        turn: turnIndex + 1,
        question: oldTurn.question,
        expected: oldTurn.expected,
        before: oldTurn,
        after: newTurn,
        rating,
        change: delta > 0 ? 'improved' : delta < 0 ? 'worse' : 'same',
        responseChanged: oldTurn.response !== newTurn.response,
        beforeTestedAt: before.testedAt,
        afterTestedAt: after.testedAt,
      });
      questionCount++;
    });
  });
  assert.equal(questionCount, 16);
  assert.equal(ratings.length, questionCount);
  const expected = baseline.agentStats.find((item) => item.agent === agent).quality;
  for (const grade of Object.keys(scores))
    assert.equal(
      rows.filter((r) => r.agent === agent && r.rating.before === grade).length,
      expected[grade],
    );
}
assert.equal(rows.length, 48);

function usage(calls) {
  const recorded = calls.filter((c) => c.usage !== null && c.usage !== undefined);
  const sum = (key) =>
    recorded.length ? recorded.reduce((n, c) => n + (c.usage[key] ?? 0), 0) : null;
  return {
    calls: calls.length,
    httpSuccess: calls.filter((c) => c.httpStatus >= 200 && c.httpStatus < 300).length,
    accepted: calls.filter((c) => c.outcome === 'accepted').length,
    rejected: calls.filter((c) => c.outcome === 'rejected').length,
    errors: Object.fromEntries(
      [...new Set(calls.map((c) => c.errorCode).filter(Boolean))].map((code) => [
        code,
        calls.filter((c) => c.errorCode === code).length,
      ]),
    ),
    usageReportedCalls: recorded.length,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    totalTokens: sum('totalTokens'),
    durationMedianMs: median(calls.map((c) => c.durationMs)),
    requestBytes: calls.reduce((n, c) => n + c.requestBytes, 0),
  };
}
function summarize(side, subset = rows) {
  const turns = subset.map((r) => r[side]);
  const calls = turns.flatMap((t) => t.apiCalls);
  assert.equal(new Set(calls.map((c) => c.id)).size, calls.length);
  return {
    questions: turns.length,
    quality: Object.fromEntries(
      Object.keys(scores).map((grade) => [
        grade,
        subset.filter((r) => r.rating[side] === grade).length,
      ]),
    ),
    apiCalls: calls.length,
    questionsWithoutExternalApiCalls: turns.filter((t) => t.apiCalls.length === 0).length,
    providers: Object.fromEntries(
      ['openai', 'jev'].map((provider) => [
        provider,
        usage(calls.filter((c) => c.provider === provider)),
      ]),
    ),
    openaiRejectedUsage: usage(
      calls.filter((c) => c.provider === 'openai' && c.outcome === 'rejected'),
    ),
    privateLeakDetections: turns.filter((t) => t.privateLeak).length,
    timing: {
      firstStatusMedianMs: median(turns.map((t) => t.timing.firstStatusMs)),
      firstTextMedianMs: median(turns.map((t) => t.timing.firstTextMs)),
      totalMedianMs: median(turns.map((t) => t.timing.totalMs)),
      totalMaxMs: Math.max(...turns.map((t) => t.timing.totalMs)),
      // Duplicate/final SSE events are excluded when judging gradual display.
      gradualTextQuestions: turns.filter((t) => new Set(t.previews.map((p) => p.content)).size > 1)
        .length,
    },
  };
}
const manifest = read('baseline-before-jev-fixed.json');
const preservedFiles = [];
for (const [file, digest] of Object.entries(manifest)) {
  const source = file.startsWith('api-usage-all.')
    ? file.replace('api-usage-all.', 'api-usage-before-jev-fixed.')
    : file;
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(root, source)))
      .digest('hex'),
    digest,
    `baseline changed: ${file}`,
  );
  preservedFiles.push(source);
}
const oldUsage = read('api-usage-before-jev-fixed.json');
const currentUsage = read('api-usage-all.json');
const byId = new Map(currentUsage.items.map((c) => [c.id, c]));
for (const item of oldUsage.items)
  assert.deepEqual(byId.get(item.id), item, 'historical log modified');
for (const call of rows.flatMap((r) => r.after.apiCalls)) assert.deepEqual(byId.get(call.id), call);
const report = {
  generatedAt: new Date().toISOString(),
  dateJST: '2026-10-07',
  method: '同一48問・同じ資料/アプリ設定。担当エージェントの評価。新規会話で再試験。',
  limitation:
    runName === 'jev-retest'
      ? 'Jevは再試験でも401。回答・時間の差をJevの効果とは断定できない。'
      : 'Vercel AI Gateway経由へ接続先を変更。通信成功・分類の採用・回答品質は別の指標。回答・時間には再生成の差も含む。',
  before: summarize('before'),
  after: summarize('after'),
  changes: {
    improved: rows.filter((r) => r.change === 'improved').length,
    worse: rows.filter((r) => r.change === 'worse').length,
    same: rows.filter((r) => r.change === 'same').length,
    responseChanged: rows.filter((r) => r.responseChanged).length,
  },
  agents: agents.map(([agent, perspective]) => ({
    agent,
    perspective,
    before: summarize(
      'before',
      rows.filter((r) => r.agent === agent),
    ),
    after: summarize(
      'after',
      rows.filter((r) => r.agent === agent),
    ),
  })),
  integrity: {
    preservedFiles,
    historicalApiRecordsUnchanged: oldUsage.items.length,
    cumulativeApiRecords: currentUsage.total,
    connectionCheckRecords: currentUsage.items.filter((c) => c.context.scope === 'connection_check')
      .length,
  },
  rows,
};
assert.deepEqual(
  report.before.quality,
  Object.fromEntries(Object.keys(scores).map((grade) => [grade, baseline.quality[grade]])),
);
const write = (extension, contents) =>
  writeFileSync(join(root, `${runName}-comparison.${extension}`), contents);
write('json', JSON.stringify(report, null, 2));
const columns = [
  '担当',
  '会話',
  'ターン',
  '質問',
  '期待',
  '前回回答',
  '今回回答',
  '前回評価',
  '今回評価',
  '理由',
  '前回完了ms',
  '今回完了ms',
  '前回OpenAI呼出',
  '今回OpenAI呼出',
  '前回Jev呼出',
  '今回Jev呼出',
];
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
write(
  'csv',
  '\uFEFF' +
    [
      columns,
      ...rows.map((r) => [
        r.perspective,
        r.title,
        r.turn,
        r.question,
        r.expected,
        r.before.response,
        r.after.response,
        labels[r.rating.before],
        labels[r.rating.after],
        r.rating.reason,
        r.before.timing.totalMs,
        r.after.timing.totalMs,
        ...['openai', 'jev'].flatMap((p) =>
          ['before', 'after'].map((s) => r[s].apiCalls.filter((c) => c.provider === p).length),
        ),
      ]),
    ]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n'),
);
write(
  'md',
  '# 専用キー設定後・同一48問の回答比較\n\n' +
    report.limitation +
    '\n\n' +
    rows
      .map(
        (r, i) =>
          `## ${i + 1}. ${r.perspective} / ${r.title} / ${r.turn}問目\n\n質問: ${r.question}\n\n期待: ${r.expected}\n\n前回（${labels[r.rating.before]}、${r.before.timing.totalMs}ms）:\n\n${r.before.response}\n\n今回（${labels[r.rating.after]}、${r.after.timing.totalMs}ms）:\n\n${r.after.response}\n\n評価理由: ${r.rating.reason}\n\n`,
      )
      .join(''),
);

// Embedded data is escaped and rendered with textContent. No remote scripts or requests.
const embedded = JSON.stringify(report).replaceAll('<', '\\u003c');
write(
  'html',
  `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>チャット回答・前回と今回の48問比較</title><style>
*{box-sizing:border-box}body{font:16px/1.7 system-ui,sans-serif;background:#f3f5f8;color:#16283d;margin:0;padding:24px}main{max-width:1200px;margin:auto}h1{font-size:26px}header,.filters,article{background:white;border:1px solid #dce3ec;border-radius:12px;padding:20px;margin:16px 0}.filters{display:flex;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:1}select,input{font:inherit;padding:8px;max-width:100%;border:1px solid #bbc8d7;border-radius:6px}input{flex:1;min-width:160px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:8px;border-bottom:1px solid #dce3ec;text-align:left}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.answer{white-space:pre-wrap;background:#f6f8fb;padding:14px;border-radius:8px}.meta{font-size:13px;color:#536780}.question{font-weight:600}.reason{border-top:1px solid #dce3ec;padding-top:12px}.improved{border-left:5px solid #25804b}.worse{border-left:5px solid #be4545}button{font:inherit;padding:8px 12px;cursor:pointer}.table-wrap{overflow:auto}@media(max-width:700px){body{padding:10px}.pair{grid-template-columns:1fr}h1{font-size:22px}.filters{position:static}}
</style><main><header><h1>チャット回答：前回と今回の48問比較</h1><p>専用キー設定後の再試験。前回の記録を残し、同じ質問で比較しました。</p><p id="notice"></p><div class="table-wrap"><table><thead><tr><th>指標</th><th>前回</th><th>今回</th></tr></thead><tbody id="stats"></tbody></table></div><p id="changes"></p><p class="meta">評価は質問担当エージェントによるものです。時間は実測値で、ネットワークや再生成の差を含みます。このファイルはローカルで開けます。</p></header>
<div class="filters"><label>担当 <select id="agent"><option value="">すべて</option><option value="technical">技術相談</option><option value="conversation">会話の継続</option><option value="privacy-orders">非公開・手続き</option></select></label><label>評価変化 <select id="change"><option value="">すべて</option><option value="improved">改善</option><option value="worse">低下</option><option value="same">同じ</option><option value="text">文章が変化</option></select></label><input id="search" aria-label="質問・回答を検索" placeholder="質問・回答を検索"><button id="reset">解除</button></div><p id="count" aria-live="polite"></p><div id="rows"></div></main>
<script type="application/json" id="data">${embedded}</script><script>
const data=JSON.parse(document.getElementById('data').textContent);
const labels={adequate:'良好',partial:'一部不足',needsImprovement:'改善必要'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
document.getElementById('notice').textContent=data.limitation;
const stats=[['良好 / 一部不足 / 改善必要',s=>Object.values(s.quality).join(' / ')],['OpenAI 呼出 / HTTP成功 / 採用',s=>[s.providers.openai.calls,s.providers.openai.httpSuccess,s.providers.openai.accepted].join(' / ')],['Jev 呼出 / HTTP成功',s=>[s.providers.jev.calls,s.providers.jev.httpSuccess].join(' / ')],['OpenAI 入出力トークン',s=>s.providers.openai.totalTokens.toLocaleString()],['本文初表示 中央値',s=>(s.timing.firstTextMedianMs/1000).toFixed(2)+'秒'],['回答完了 中央値',s=>(s.timing.totalMedianMs/1000).toFixed(2)+'秒']];
for(const [name,fn] of stats){const tr=el('tr');tr.append(el('th',name),el('td',fn(data.before)),el('td',fn(data.after)));document.getElementById('stats').append(tr)}
document.getElementById('changes').textContent='改善 '+data.changes.improved+'問 / 同評価 '+data.changes.same+'問 / 低下 '+data.changes.worse+'問。文章が変わったのは '+data.changes.responseChanged+'問。';
function render(){const agent=document.getElementById('agent').value,change=document.getElementById('change').value,q=document.getElementById('search').value.toLowerCase();const rows=data.rows.filter(r=>(!agent||r.agent===agent)&&(!change||(change==='text'?r.responseChanged:r.change===change))&&[r.question,r.before.response,r.after.response,r.rating.reason].join(' ').toLowerCase().includes(q));const container=document.getElementById('rows');container.replaceChildren();document.getElementById('count').textContent=rows.length+' / 48問を表示';for(const r of rows){const card=el('article',undefined,r.change);card.append(el('h2',r.perspective+'・'+r.title+'・'+r.turn+'問目'),el('p',r.question,'question'));const pair=el('div',undefined,'pair');for(const side of ['before','after']){const turn=r[side],box=el('section');box.append(el('h3',(side==='before'?'前回':'今回')+'：'+labels[r.rating[side]]),el('p',turn.response,'answer'));const api=turn.apiCalls.map(c=>c.provider+' HTTP'+c.httpStatus+' '+c.outcome+(c.errorCode?' ('+c.errorCode+')':'')).join(' / ')||'API呼出なし';box.append(el('p','初表示 '+turn.timing.firstTextMs+'ms / 完了 '+turn.timing.totalMs+'ms / '+api,'meta'));pair.append(box)}card.append(pair,el('p',r.rating.reason,'reason'));container.append(card)}}
for(const id of ['agent','change','search'])document.getElementById(id).addEventListener('input',render);document.getElementById('reset').addEventListener('click',()=>{for(const id of ['agent','change','search'])document.getElementById(id).value='';render()});render();
</script></html>`,
);
console.log(
  JSON.stringify(
    {
      before: report.before,
      after: report.after,
      changes: report.changes,
      integrity: report.integrity,
    },
    null,
    2,
  ),
);
