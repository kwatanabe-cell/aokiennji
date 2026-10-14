import { expect, it } from 'vitest';
import { planChatRoute, policyKeys, type ChatRouteInput } from '../lib/chat-policy';
import { localIntent } from '../lib/server/providers';

function route(message: string, options: Partial<ChatRouteInput> = {}) {
  return planChatRoute({
    message,
    intent: localIntent(message),
    knownProduct: message.includes('DEMO-GLASS-01'),
    privateQuestion: false,
    previousProduct: false,
    ...options,
  });
}
it.each([
  'DEMO-GLASS-01の価格は？',
  'DEMO-GLASS-01の在庫は？',
  'DEMO-GLASS-01はいつ届きますか？',
  'DEMO-GLASS-01の見積を相談したい',
  'DEMO-GLASS-01を注文したい',
  'DEMO-GLASS-01を売っていますか',
  'UNKNOWN-999の値段は？',
  'いつぐらいに届く？',
  'こんにちは',
  'ありがとう',
])('does not request an external API for a locally understood inquiry: %s', (message) => {
  expect(route(message)).toMatchObject({ response: 'local', classify: false, search: false });
});
it('recognizes a registered name without requiring a model number', () => {
  expect(route('耐熱ガラスの予算を教えて', { knownProduct: true })).toMatchObject({
    facts: ['price'],
    response: 'local',
    classify: false,
  });
});
it('keeps known product consultation on the AI route without a redundant classification', () => {
  expect(route('DEMO-GLASS-01は高温環境で使えますか？')).toMatchObject({
    reason: 'consultation',
    response: 'ai',
    classify: false,
    search: false,
  });
});
it('uses an AI decision for ambiguous descriptions while keeping explicit prices locally authored', () => {
  expect(route('液体を止める部品を探したい')).toMatchObject({
    response: 'ai',
    classify: true,
    search: true,
  });
  expect(route('液体を止める部品の価格は？')).toMatchObject({
    response: 'local',
    facts: ['price'],
    classify: true,
    search: false,
  });
  expect(route('UNKNOWN-999を探している')).toMatchObject({
    response: 'ai',
    classify: false,
    search: true,
  });
});
it('separates multiple business questions and mixed consultation', () => {
  expect(route('DEMO-GLASS-01の価格と納期は？')).toMatchObject({
    response: 'local',
    facts: ['price', 'lead_time'],
  });
  expect(route('DEMO-GLASS-01の価格と用途を相談したい')).toMatchObject({
    reason: 'mixed',
    response: 'mixed',
    facts: ['price'],
    classify: false,
  });
});
it('inherits the calculation intent for quantities and candidate selection', () => {
  expect(
    route('10個くらい欲しい', { previousProduct: true, previousIntent: 'price' }),
  ).toMatchObject({ response: 'local', facts: ['price'], classify: false });
  expect(
    route('2番目の商品', { previousProduct: true, previousIntent: 'lead_time' }),
  ).toMatchObject({ response: 'local', facts: ['lead_time'], classify: false });
});
it('never sends confidential questions or policy explanations to a model', () => {
  expect(route('仕入先の用途別リストを相談したい', { privateQuestion: true })).toMatchObject({
    reason: 'privacy',
    response: 'local',
    classify: false,
    search: false,
  });
  expect(
    route('この一覧で全社を判断できる？', { topic: { mode: 'scope', fields: [] } }),
  ).toMatchObject({ reason: 'privacy', response: 'local', classify: false });
});
it.each([
  ['では、いま分かっている希望条件を、担当者に伝えやすいように短くまとめてください。', 'summary'],
  ['担当者に送る説明を短く作ってください。', 'summary'],
  ['問い合わせに使う文章を作ってください。ポンプ1台の在庫を確認したいです。', 'summary'],
  ['パッキンも一緒に相談したいです。断熱材とまとめて見積できますか？', 'transaction'],
  ['その相談を実際の担当者に渡すには、どのボタンを押せばよいですか？', 'handoff'],
  ['分かりました、担当の方に相談します。ありがとう。', 'handoff'],
  ['今のポンプ1台の注文内容はもう担当者に送信されましたか？', 'transaction'],
  ['ありがとうございます。助かりました。', 'social'],
  [
    'ありがとうございます。さっきの搬送台車1台の方に戻ります。300kgを載せる時に確認すべきことを教えてください。',
    'consultation',
  ],
  ['窓は100ミリ角で、厚さは未定です。毎日加熱して冷ますので、温度変化が心配です。', 'consultation'],
  ['20個必要です。今使っている物の写真と寸法なら送れます。', 'consultation'],
])('routes %s to %s', (message, reason) => {
  expect(route(message).reason).toBe(reason);
});
it('distinguishes procedure questions and keeps them local unless advice is asked', () => {
  expect(route('注文前に、在庫を取り置きしておいてもらえますか？')).toMatchObject({
    reason: 'transaction',
    transaction: 'hold',
    response: 'local',
  });
  expect(route('確認メールも届きますか？')).toMatchObject({ transaction: 'status' });
  expect(route('これで外側が安全な温度になるかは、担当者に確認した方がよいですか？')).toMatchObject(
    { reason: 'handoff', response: 'mixed' },
  );
  expect(
    route('まだ型番が分からないのですが、おおよそいくらぐらいですか？', {
      topic: { mode: 'fields', fields: ['パッキン'] },
      hasContext: true,
    }),
  ).toMatchObject({ reason: 'facts', response: 'mixed', facts: ['price'] });
});
it('treats material grades as conditions and short answers as a continuation', () => {
  expect(localIntent('目開き1ミリでSUS316のものを探しています。').model).toBeUndefined();
  expect(localIntent('材質はSS400、DEMO-GLASS-01と同じ形です').model).toBe('DEMO-GLASS-01');
  for (const reply of ['はい', 'お願いします', 'わかりません'])
    expect(route(reply, { previousProduct: true })).toMatchObject({
      reason: 'discovery',
      response: 'ai',
    });
});
it('answers terms locally and adds a consultation only when conditions are given', () => {
  expect(route('送料は無料にしてもらえますか？')).toMatchObject({
    reason: 'policy',
    response: 'local',
  });
  expect(
    route('ラインが止まってます！ポンプの軸から水が漏れていて、パッキンを至急交換したいです。'),
  ).toMatchObject({ reason: 'policy', response: 'mixed' });
  expect(route('How much for 5 pcs?', { knownProduct: true, previousProduct: true })).toMatchObject(
    {
      reason: 'facts',
      facts: ['price'],
      response: 'local',
    },
  );
});
it('keeps conditions that look like terms out of the policy answers', () => {
  for (const message of [
    'ボルトの締め付けトルクはどう決めますか？',
    '施工場所は屋外で、温度は100度です。',
    '耐熱性が必ず必要です。',
    '目安として温度は100度くらいです。',
  ])
    expect(route(message).reason).not.toBe('policy');
  expect(route('支払いは月末締め翌月末払いでお願いできますか？').reason).toBe('policy');
  expect(route('まだ型番が分からないのですが、おおよそいくらぐらいですか？').facts).toEqual([
    'price',
  ]);
});
it('answers what to prepare before a hand-off, not only how to hand off', () => {
  expect(
    route('炉の外側に使います。担当者に相談するとき、何を調べておけばいいですか？'),
  ).toMatchObject({
    reason: 'handoff',
    response: 'mixed',
  });
});
// Customer-agent conversations of 2026-10-13 that received the wrong fixed text.
it.each([
  ['今日注文したら最短いつ出荷ですか？金曜の午前着指定ってできます？', 'lead_time'],
  ['注文じゃなくて出荷の目安を聞いてるんです。', 'lead_time'],
  [
    'いえ、まだ注文ではありません。見積を依頼した場合に、何営業日くらいで回答をいただけますか。',
    '',
  ],
  [
    '今週金曜までに発注先を決めたいのですが、見積依頼をした場合、回答はどのくらいでいただけますか。',
    '',
  ],
  ['覗き窓は二重ガラスが一般的ですか？答えを見て、このまま見積を依頼するか決めます。', ''],
])('does not treat a mentioned order or quote as a request: %s', (message, fact) => {
  const result = route(message, { hasContext: true });
  expect(result.reason).not.toBe('transaction');
  expect(result.facts).toEqual(fact ? [fact] : []);
});
it('answers questions about the quote itself and keeps real requests as requests', () => {
  expect(route('見積の回答はだいたい何営業日くらいで来ますか？')).toMatchObject({
    reason: 'policy',
  });
  for (const message of [
    '見積お願いします',
    'この内容で見積を依頼します。',
    'わかりました、見積にします。',
  ])
    expect(route(message)).toMatchObject({ reason: 'transaction', transaction: 'quote' });
  expect(route('この商品を注文したいです')).toMatchObject({ transaction: 'order' });
  // A price question is answered first; the quote request is offered below it.
  expect(route('DEMO-GLASS-01を50個購入したいと考えています。単価を教えてください。').reason).toBe(
    'facts',
  );
});
it('keeps negated words, "まとめての発注" and a deadline out of the wrong answers', () => {
  expect(route('在庫の話ではなく選定の相談です。どちらが向いていますか？').facts).toEqual([]);
  expect(route('30個まとめての発注で数量値引きは見込めますか。').reason).toBe('policy');
  expect(policyKeys('12月20日の据付に間に合わせたいです。')).not.toContain('installation');
  expect(policyKeys('据付もお願いできますか？')).toContain('installation');
  expect(policyKeys('社内で加工されるんですか、それとも外注ですか？')).toEqual(['outsourcing']);
});
it('reads belt and bearing numbers as models, but not threads, sizes or alloys', () => {
  expect(localIntent('三ツ星の標準のB形、B60です').model).toBe('B60');
  expect(localIntent('NSKの6205DDUを10個').model).toBe('6205DDU');
  expect(localIntent('6305ZZC3で').model).toBe('6305ZZC3');
  for (const message of [
    'SUS304の六角ボルト M16×65',
    'W600×D400のトレー',
    'A5052の板',
    'S45Cの丸棒',
  ])
    expect(localIntent(message).model).toBeUndefined();
});
it('reads the cut-off time, the shipping cost, form edits and acknowledgements', () => {
  expect(policyKeys('何時までに頼めば当日発送？')).toEqual(['cutoff']);
  expect(policyKeys('営業時間は何時までですか？')).toEqual(['hours']);
  expect(route('送料はいくらくらいですか？').facts).toEqual([]);
  expect(policyKeys('フォームで依頼内容を書き直せますか？')).toContain('formEdit');
  expect(policyKeys('値引きの件は承知しました。60個だと税込でいくらですか？')).toEqual([]);
  expect(policyKeys('支払いは大丈夫ですか？')).toEqual(['payment']);
  expect(localIntent('バンドーのレッドS-II B-60を3本').model).toBe('B-60');
  // NFKC turns "℃" into "°C"; both are temperatures.
  expect(route('蒸気ラインで165℃です').reason).toBe('consultation');
});
