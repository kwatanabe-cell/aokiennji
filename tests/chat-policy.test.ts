import { expect, it } from 'vitest';
import { planChatRoute, type ChatRouteInput } from '../lib/chat-policy';
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
