import type { KnowledgeTopic, QueryIntent } from './contracts';

export type BusinessIntent = 'price' | 'stock' | 'lead_time' | 'quote' | 'order';
const businessPatterns: Record<BusinessIntent, RegExp> = {
  price: /価格|値段|いくら|単価|金額|費用|予算/,
  stock: /在庫|何個|何台|残って|残り/,
  lead_time:
    /納期|配送|配達|発送|到着|届く|届き|届い|入荷|納品|受け取|何日|何週間|いつ(ぐらい|くらい|頃|ごろ|に|まで|なら|です|？|\?)/,
  quote: /見積/,
  order: /注文|発注/,
};
export function businessIntents(message: string): BusinessIntent[] {
  const text = message.normalize('NFKC');
  return (Object.keys(businessPatterns) as BusinessIntent[]).filter((key) =>
    businessPatterns[key].test(text),
  );
}

export const CHAT_ROUTE_LABELS = {
  privacy: '非公開情報・公開範囲の案内',
  transaction: '見積・注文の手続き案内',
  facts: '登録情報・金額計算',
  clarification: '商品を特定するための確認',
  social: 'あいさつ・基本案内',
  lookup: '登録済みの商品・分野の照合',
  consultation: '用途・仕様・比較の相談',
  discovery: '曖昧な商品説明の理解',
  mixed: '登録情報の回答と用途相談',
} as const;

export interface ChatRouteInput {
  message: string;
  intent: QueryIntent;
  knownProduct: boolean;
  topic?: KnowledgeTopic;
  privateQuestion: boolean;
  previousIntent?: QueryIntent['intent'];
  previousProduct: boolean;
}
export interface ChatRoute {
  classify: boolean;
  search: boolean;
  response: 'local' | 'ai' | 'mixed';
  reason: keyof typeof CHAT_ROUTE_LABELS;
  facts: BusinessIntent[];
}

// This policy owns whether external services are called. Models may help
// identify a topic, but never choose whether business rules can be bypassed.
export function planChatRoute(input: ChatRouteInput): ChatRoute {
  const { message, intent, topic } = input;
  const text = message.normalize('NFKC').trim();
  const route = (
    reason: ChatRoute['reason'],
    facts: BusinessIntent[] = [],
    response: ChatRoute['response'] = 'local',
    classify = false,
    search = false,
  ): ChatRoute => ({ reason, facts, response, classify, search });
  if (input.privateQuestion || (topic && topic.mode !== 'fields')) return route('privacy');

  const facts = businessIntents(text);
  const quantityOrSelection =
    /^(?:それを|この商品を|こちらを|数量は|では|じゃあ|はい|まずは|とりあえず)?\s*(?:\d+\s*(?:個|台|枚|本|セット)|[1-4一二三四](?:番目?|つ目))/.test(
      text,
    );
  const inherited =
    quantityOrSelection &&
    input.previousProduct &&
    input.previousIntent &&
    input.previousIntent in businessPatterns
      ? (input.previousIntent as BusinessIntent)
      : undefined;
  if (!facts.length && inherited) facts.push(inherited);
  if (!facts.length && intent.intent in businessPatterns)
    facts.push(intent.intent as BusinessIntent);

  const knownTopic =
    input.knownProduct ||
    !!topic?.fields.length ||
    ((quantityOrSelection || intent.referencesPrevious) && input.previousProduct);
  // An unknown model may be searched, but must never be changed by the model.
  const classify =
    !intent.model && !knownTopic && !intent.referencesPrevious && intent.intent !== 'general';
  const consultation =
    /相談|用途|使い方|選び方|どう選|どう使|どのように|選定|比較|違い|おすすめ|適し|適合|使える|使えます|使いたい|使用でき|仕様|材質|耐え|温度|圧力|寸法|性能|図面|製作|製造|設計|特注/.test(
      text,
    ) || intent.intent === 'custom';

  if (facts.some((f) => f === 'quote' || f === 'order'))
    return route('transaction', facts, 'local', classify);
  if (facts.length) {
    if (consultation) return route('mixed', facts, 'mixed', classify);
    return route(knownTopic || intent.model ? 'facts' : 'clarification', facts, 'local', classify);
  }
  if (intent.intent === 'general' && !consultation) return route('social');
  if (consultation)
    return route('consultation', [], 'ai', classify, !knownTopic && !intent.referencesPrevious);
  if (knownTopic || (intent.referencesPrevious && input.previousProduct)) return route('lookup');
  return route('discovery', [], 'ai', classify, !intent.referencesPrevious);
}
