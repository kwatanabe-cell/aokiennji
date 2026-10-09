import type { AppSettings, Product, QueryIntent } from '../contracts';
import type { BusinessIntent } from '../chat-policy';

const topics: Partial<Record<QueryIntent['intent'], string>> = {
  price: '価格',
  stock: '在庫',
  lead_time: 'お届け時期',
  quote: 'お見積り',
  order: 'ご注文',
};

export function productReply(
  products: Product[],
  intent: QueryIntent['intent'],
  settings: AppSettings,
  quantity?: number,
) {
  if (!products.length)
    return '以前ご案内した商品情報は、現在確認できない状態です。担当者への確認をご案内できます。';
  if (products.length > 1) {
    const topic = topics[intent];
    return topic
      ? `${topic}についてですね。候補が${products.length}件あるので、どの商品か教えていただけますか？\n商品名・型番、または「1番目」のようにお答えください。`
      : `候補が${products.length}件見つかりました。どの商品をお探しでしょうか？\n商品名や型番がわからなければ、用途からも一緒に絞り込めます。`;
  }
  const p = products[0];
  const label = `「${p.name}」`;
  if (p.availability === 'needs_review')
    return `${label}の登録はありますが、現在の取扱条件を確認する必要があります。\n価格・在庫・納期は、担当者の確認後にご案内します。ご希望の数量や用途を教えていただけますか？`;
  if (p.availability === 'unavailable')
    return `${label}は現在、取扱対象外として登録されています。\n用途や必要な仕様を教えていただければ、代替品のご相談を承ります。`;
  switch (intent) {
    case 'lead_time':
      return settings.flags.showLeadTime && p.leadTime
        ? `お届け時期についてですね。${label}の登録上の納期は「${p.leadTime}」です。\n${quantity ? `ご希望は${quantity}個ですね。具体的なお届け日は、配送先と必要数量を確保できるかを確認してご案内します。` : '具体的なお届け日は、数量と配送先を確認してご案内します。'}ご希望の時期はありますか？`
        : `${label}の納期は、担当者への確認が必要です。\nご希望の数量とお届け先の都道府県、必要な時期を教えていただけますか？`;
    case 'price':
      return settings.flags.showPrice && p.price !== null
        ? quantity
          ? `${quantity}個ですね。${label}の登録単価から計算すると、商品代金の目安は${(p.price * quantity).toLocaleString('ja-JP')}円（税抜・送料別）です。\n正式な金額と条件は、お見積りでご案内します。`
          : `${label}の参考価格は、1個あたり${p.price.toLocaleString('ja-JP')}円（税抜）です。\n数量や送料を含む正式な金額は、お見積りでご案内します。何個ほど必要でしょうか？`
        : `${label}の価格は個別にご案内します。ご希望の数量を教えていただけますか？`;
    case 'stock':
      return settings.flags.showStock && p.stock !== null
        ? `${label}の登録在庫は${p.stock.toLocaleString('ja-JP')}個です。\n${quantity ? `ご希望の${quantity}個を確保できるかは、ご注文前に担当者が確認します。` : '在庫は変動するため、確保できる数量はご注文前に確認します。何個ほど必要でしょうか？'}`
        : `${label}の在庫は、担当者への確認が必要です。ご希望の数量を教えていただけますか？`;
    case 'quote':
      return settings.flags.quoteRequests
        ? `${label}のお見積りですね。商品詳細の「見積を依頼する」から、数量とご連絡先を送信できます。ご相談内容も添えてお申し込みください。`
        : '現在、オンラインの見積受付は休止しています。お電話でのご相談をご利用ください。';
    case 'order':
      return settings.flags.orders
        ? `${label}のご注文についてですね。発行済みの見積専用ページで、内容を確認して注文を依頼できます。お見積りはお持ちでしょうか？`
        : '現在、オンラインの注文受付は休止しています。担当者へのご相談をご利用ください。';
    default:
      return p.availability === 'orderable'
        ? `${label}は、取り寄せに対応しています。\n価格・在庫・お届け時期など、知りたいことをそのまま続けてお聞きください。`
        : `はい、${label}を取り扱っています。\n価格・在庫・お届け時期など、知りたいことをそのまま続けてお聞きください。`;
  }
}

export function missingProductReply(intent: QueryIntent['intent']) {
  const topic = topics[intent];
  return topic
    ? `${topic}についてですね。どの商品か、商品名や型番を教えていただけますか？\nわからない場合は、用途やメーカー名からお探しします。`
    : 'もう少し詳しく教えていただけますか？商品名・型番、または「高温の炉で使うガラス」のような用途からお探しします。';
}

export function factualReply(
  products: Product[],
  facts: BusinessIntent[],
  intent: QueryIntent['intent'],
  settings: AppSettings,
  quantity?: number,
) {
  if (
    facts.length < 2 ||
    products.length !== 1 ||
    !products[0].approved ||
    ['needs_review', 'unavailable'].includes(products[0].availability)
  )
    return productReply(products, facts[0] || intent, settings, quantity);
  // Each paragraph comes from the same deterministic rules as a single query.
  return facts.map((f) => productReply(products, f, settings, quantity)).join('\n\n');
}
