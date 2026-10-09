import type {
  ChatMessage,
  ChatResponse,
  Conversation,
  Evidence,
  Product,
  QueryIntent,
  Source,
  Supplier,
} from '../contracts';
import { audit, byId, db, getSettings, list, normalize, now, save, uid } from './db';
import {
  conversationMessages,
  publicProduct,
  publicProducts,
  requireFlag,
  verifyConversation,
} from './business';
import { classifyQuery, localIntent, searchWeb } from './providers';
import { missingProductReply, factualReply } from './chat-replies';
import { CHAT_ROUTE_LABELS, planChatRoute } from '../chat-policy';
import { documentCandidates } from './retrieval';
import { generateGroundedReply, groundingHash } from './ai-responses';
import {
  availableFields,
  containsPrivateSupplierIdentity,
  knowledgeReply,
  knowledgeTopic,
  privateSupplierQuestion,
} from './supplier-knowledge';

export async function answerChat(
  message: string,
  owner: string,
  conversationId?: string,
  output: { onText?: (text: string) => void; signal?: AbortSignal } = {},
): Promise<ChatResponse> {
  output = { ...output, signal: output.signal || AbortSignal.timeout(13000) };
  requireFlag('chat');
  const userCreatedAt = now();
  const settings = getSettings();
  const conversation: Conversation = conversationId
    ? verifyConversation(conversationId, owner)
    : {
        id: uid(),
        title: message.slice(0, 60),
        status: 'open',
        createdAt: userCreatedAt,
        updatedAt: now(),
      };
  const previous = conversationId ? currentMessages(conversation.id) : [];
  const usageContext = { scope: 'chat' as const, conversationId: conversation.id, turnId: uid() };
  const privateQuestion = privateSupplierQuestion(message);
  const safeHistory = previous.filter((m) => !privateSupplierQuestion(m.content));
  const local = localIntent(message);
  const catalog = publicProducts();
  const lastReply = previous.toReversed().find((m) => m.role === 'assistant');
  const localMatches = matchCatalog(message, local, catalog);
  const localTopic = knowledgeTopic(message, local, lastReply);
  const routeInput = {
    message,
    intent: local,
    knownProduct: localMatches.length > 0,
    topic: localTopic,
    privateQuestion,
    previousIntent: lastReply?.intent,
    previousProduct: !!lastReply?.products?.length,
  };
  const planned = planChatRoute(routeInput);
  const candidates =
    privateQuestion || (!planned.classify && planned.response === 'local')
      ? []
      : documentCandidates(message, local);
  // Independent I/O starts together, only when the server policy requests it.
  const shouldSearchWeb =
    planned.search && settings.flags.webSearch && settings.searchProvider !== 'none';
  const webWork = shouldSearchWeb
    ? searchWeb(
        message,
        settings,
        list<Supplier>('suppliers')
          .filter((s) => s.enabled && s.approved)
          .flatMap((s) => s.domains),
      )
        .then((data) => ({ data, failed: false }))
        .catch(() => ({ data: [] as Evidence[], failed: true }))
    : Promise.resolve({ data: [] as Evidence[], failed: false });
  const intent = !planned.classify
    ? local
    : await classifyQuery(message, settings, safeHistory, {
        fields: availableFields(),
        evidence: candidates.map((c) => c.evidence),
        signal: output.signal,
        usageContext,
      });
  // Explicit locally recognized business requests keep their meaning even if
  // a model chooses another category while identifying the requested item.
  if (local.intent !== 'product') intent.intent = local.intent;
  let matches = matchCatalog(message, intent, catalog);
  const query = normalize(message);
  // The most recent turn is the topic boundary. Never revive an older product
  // after the customer has asked about a new, unknown model.
  const last = previous.toReversed().find((m) => m.role === 'assistant');
  const priorProducts = last?.products || [];
  const quantityMatch = message
    .normalize('NFKC')
    .match(/(?:^|[^\d])(\d{1,6})\s*(?:個|台|枚|本|セット)/);
  const statedQuantity =
    quantityMatch && Number(quantityMatch[1]) > 0 ? Number(quantityMatch[1]) : undefined;
  const quantityFollowup =
    statedQuantity &&
    /^(?:それを|この商品を|こちらを|数量は|では|じゃあ|はい|まずは|とりあえず)?\s*\d/.test(
      message.normalize('NFKC').trim(),
    );
  const ordinal = message
    .normalize('NFKC')
    .match(/^(?:では|じゃあ)?\s*([1-4一二三四])(?:番目?|つ目)/);
  const ordinalIndex = ordinal
    ? '1234'.includes(ordinal[1])
      ? Number(ordinal[1]) - 1
      : '一二三四'.indexOf(ordinal[1])
    : -1;
  let continued = false;
  if (!matches.length && !intent.model) {
    const branded = priorProducts.filter(
      (p) => p.manufacturer && query.includes(normalize(p.manufacturer)),
    );
    if (branded.length) {
      matches = branded;
      continued = true;
    } else if (ordinalIndex >= 0 && priorProducts[ordinalIndex]) {
      matches = [priorProducts[ordinalIndex]];
      continued = true;
    } else if (intent.referencesPrevious || intent.intent === 'general' || quantityFollowup) {
      matches = priorProducts;
      continued = !!matches.length;
    }
    if (
      continued &&
      intent.intent === 'product' &&
      last?.presentation === 'selection' &&
      last.intent
    )
      intent.intent = last.intent;
    if (continued && quantityFollowup && intent.intent === 'product')
      intent.intent =
        last?.intent && ['price', 'stock', 'lead_time', 'quote', 'order'].includes(last.intent)
          ? last.intent
          : 'stock';
  }
  const requestedQuantity = statedQuantity || (continued ? last?.requestedQuantity : undefined);
  const topic = knowledgeTopic(message, intent, last);
  if (topic) matches = [];
  const route = planChatRoute({ ...routeInput, intent, knownProduct: matches.length > 0, topic });
  // A newly identified field may still need the original conversational reply.
  if (planned.response === 'ai' && !route.facts.length && route.reason !== 'privacy') {
    route.response = 'ai';
    route.reason = planned.reason;
  }
  const evidence: Evidence[] = matches.flatMap((p) => p.evidence || []);
  let externalWarning = '';
  const external = await webWork;
  if (external.failed) externalWarning = ' Web検索は現在利用できません。';
  if (!topic && !matches.length && intent.intent !== 'general') {
    if (intent.evidenceIndex !== undefined && candidates[intent.evidenceIndex])
      evidence.push(candidates[intent.evidenceIndex].evidence);
    else
      evidence.push(
        ...candidates
          .filter((c) => c.matched)
          .slice(0, 3)
          .map((c) => c.evidence),
      );
    evidence.push(
      ...external.data.filter(
        (e) =>
          !privateSupplierQuestion([e.title, e.excerpt].join(' ')) &&
          !containsPrivateSupplierIdentity(e.url || ''),
      ),
    );
  }
  let content = topic
    ? knowledgeReply(topic, settings, route.facts)
    : matches.length
      ? factualReply(matches, route.facts, intent.intent, settings, requestedQuantity)
      : evidence.length
        ? '関連する資料・候補が見つかりました。資料の記載だけでは販売・取り寄せ可否を確定できないため、担当者の確認が必要です。'
        : intent.model
          ? `「${intent.model}」は、現在の登録情報では取扱いを確認できませんでした。\n取扱いがないと決まったわけではありません。メーカー名や用途を教えていただけますか？`
          : missingProductReply(intent.intent);
  if (!topic && intent.intent === 'custom' && !route.facts.length)
    content =
      '図面や仕様をもとに、設計・製作のご相談を承ります。\nまず、何に使うものか教えていただけますか？材質や大きさが決まっていれば、あわせてお聞かせください。製作可否は担当者が確認します。';
  if (
    (!topic ||
      (topic.mode === 'fields' &&
        /ありがとう|助か|了解|わかりました|分かりました|なるほど|どうも/.test(message))) &&
    intent.intent === 'general'
  )
    content = /ありがとう|助か|了解|わかりました|分かりました|なるほど|どうも/.test(message)
      ? 'どういたしまして。ほかに確認したいことがあれば、そのまま続けてお聞きください。'
      : 'こんにちは。アオキエンジの商品・製作相談アシスタントです。\n商品の取扱い、価格・在庫・納期の確認や、図面からの製作についてご案内します。どのようなものをお探しですか？';
  content += externalWarning;
  const canonical = content;
  const adviceCanonical = topic
    ? knowledgeReply(topic, settings)
    : matches.length
      ? `「${matches.map((p) => p.name).join('」「')}」についてご相談いただけます。用途への適合や個別の対応可否は担当者が確認します。どのような環境で使うか教えてください。`
      : route.facts.length
        ? '用途や仕様を整理するお手伝いができます。どのような場面で使うものか教えてください。'
        : canonical;
  if (route.response === 'mixed') output.onText?.(canonical);
  const generated =
    route.response !== 'local'
      ? await generateGroundedReply(
          {
            question: message,
            history: safeHistory,
            canonical: adviceCanonical,
            settings,
            facts: [
              { id: 'business_rules', text: adviceCanonical },
              ...matches.map((p, i) => ({
                id: `product_${i}`,
                text: JSON.stringify({
                  name: p.name,
                  model: p.model,
                  description:
                    p.approved && !privateSupplierQuestion(p.description) ? p.description : '',
                  specifications:
                    p.approved && !privateSupplierQuestion(p.specifications)
                      ? p.specifications
                      : '',
                }),
              })),
              ...evidence.map((e, i) => ({
                id: `evidence_${i}`,
                text: `${e.title}: ${e.excerpt}`,
              })),
            ],
            // The AI writes consultation text only. Even for a registered product,
            // business facts and confirmation of sales remain locally authored.
            confirmedProduct: false,
            businessFactsOwnedLocally: true,
            privateText: privateSupplierQuestion,
          },
          {
            usageContext,
            signal: AbortSignal.any([
              output.signal!,
              AbortSignal.timeout(Math.max(100, 12000 - (Date.now() - Date.parse(userCreatedAt)))),
            ]),
            onText: (text) =>
              output.onText?.(route.response === 'mixed' ? `${canonical}\n\n${text}` : text),
          },
        )
      : { content: canonical, provider: 'local' as const, reason: route.reason };
  content = route.response === 'mixed' ? `${canonical}\n\n${generated.content}` : generated.content;
  output.onText?.(content);
  if (output.signal?.aborted) throw new Error('処理が中断されました');
  const assistant: ChatMessage = {
    id: uid(),
    role: 'assistant',
    content,
    responseProvider: generated.provider,
    groundingHash: groundingHash(matches, topic, evidence, settings.flags),
    knowledge: topic,
    products: matches,
    evidence,
    intent: intent.intent,
    factualIntents: route.facts,
    requestedQuantity,
    presentation: topic
      ? 'reply'
      : matches.length > 1 && intent.intent !== 'general'
        ? 'selection'
        : continued || intent.intent === 'general'
          ? 'reply'
          : 'products',
    suggestions: topic
      ? topic.mode === 'fields'
        ? ['この分野の見積を相談したい', '必要な仕様を相談したい']
        : ['どんな製品を扱っていますか？']
      : intent.intent === 'custom'
        ? ['耐熱ガラスについて相談したい']
        : matches.length > 1
          ? matches.map(
              (p) =>
                `${p.manufacturer ? p.manufacturer + ' ' : ''}${p.model || p.name}${intent.intent === 'lead_time' ? 'の納期は？' : intent.intent === 'price' ? 'の価格は？' : intent.intent === 'stock' ? 'の在庫は？' : 'について教えて'}`,
            )
          : matches.length
            ? [
                intent.intent !== 'lead_time' && 'いつぐらいに届く？',
                intent.intent !== 'price' && '価格は？',
                settings.flags.quoteRequests && intent.intent !== 'quote' && '見積を依頼したい',
              ].filter((s): s is string => !!s)
            : ['図面から製作できますか？'],
    createdAt: now(),
  };
  db().transaction(() => {
    save('conversations', { ...conversation, updatedAt: now() }, { owner_id: owner });
    save(
      'messages',
      {
        id: usageContext.turnId,
        conversationId: conversation.id,
        role: 'user',
        content: message,
        createdAt: userCreatedAt,
      },
      { conversation_id: conversation.id },
    );
    save(
      'messages',
      { ...assistant, conversationId: conversation.id },
      { conversation_id: conversation.id },
    );
    if (!conversationId) audit('conversation.created', conversation.id, '商品相談を受け付けました');
    audit(
      'chat.routed',
      conversation.id,
      `振り分け:${CHAT_ROUTE_LABELS[route.reason]} / ${route.reason} / 分類:${intent.provider} / 回答:${generated.provider} / ${generated.reason} / Web:${shouldSearchWeb ? '実行' : '省略'} / ${Date.now() - Date.parse(userCreatedAt)}ms`,
    );
  })();
  return { conversationId: conversation.id, message: assistant };
}
export function currentMessages(id: string): ChatMessage[] {
  const settings = getSettings();
  const fields = availableFields();
  return conversationMessages(id).map((m) => {
    const knowledge = m.knowledge
      ? { ...m.knowledge, fields: m.knowledge.fields.filter((f) => fields.includes(f)) }
      : undefined;
    const products = m.products
      ?.map((p) => byId<Product>('products', p.id))
      .filter((p): p is Product => !!p)
      .map(publicProduct)
      .filter((p): p is Product => !!p);
    const evidence = m.evidence?.filter((e) => {
      const source = e.sourceId ? byId<Source>('sources', e.sourceId) : undefined;
      if (
        e.visibility !== 'public' ||
        (e.sourceId && !source?.enabled) ||
        (source?.visibility === 'internal' &&
          (e.url || !['社内資料の関連情報', '社内確認済み情報'].includes(e.title)))
      )
        return false;
      if (e.id) {
        const document = byId<{ createdAt: string }>('documents', e.id);
        if (!document || document.createdAt !== e.retrievedAt) return false;
      }
      return (
        !privateSupplierQuestion([e.title, e.excerpt].join(' ')) &&
        !containsPrivateSupplierIdentity(e.url || '')
      );
    });
    const generatedStillValid =
      m.responseProvider &&
      m.responseProvider !== 'local' &&
      m.groundingHash === groundingHash(products, knowledge, evidence, settings.flags);
    return {
      ...m,
      // Rebuild factual replies against today's permissions and facts, including
      // when a source is disabled or price/stock visibility changes after a turn.
      content: generatedStillValid
        ? m.content
        : m.role === 'assistant' && knowledge && m.intent !== 'general'
          ? knowledgeReply(knowledge, settings, m.factualIntents)
          : m.role === 'assistant' &&
              m.products?.length &&
              m.intent &&
              (m.factualIntents?.length || !['general', 'custom'].includes(m.intent))
            ? factualReply(
                products || [],
                m.factualIntents || [],
                m.intent,
                settings,
                m.requestedQuantity,
              )
            : m.responseProvider && m.responseProvider !== 'local'
              ? '現在の登録情報が更新されているため、もう一度ご質問ください。最新の情報でご案内します。'
              : m.content,
      knowledge,
      products,
      evidence,
    };
  });
}

function matchCatalog(message: string, intent: QueryIntent, catalog: Product[]): Product[] {
  let matches: Product[] = [];
  const query = normalize(message);
  if (intent.model) {
    matches = catalog.filter((p) => normalize(p.model) === normalize(intent.model!));
    const branded = matches.filter(
      (p) => p.manufacturer && query.includes(normalize(p.manufacturer)),
    );
    if (branded.length) matches = branded;
  } else {
    const candidates = catalog.map((p) => {
      const name = normalize(p.name.replace(/（確認用）/g, ''));
      const named =
        ['耐熱ガラス', 'ガラス', '炉内金物', 'スタッド', '鋳物', 'ダクト', '台車'].some(
          (word) => p.name.includes(word) && query.includes(normalize(word)),
        ) ||
        (p.name.includes('炉内金物') && /工業炉|炉の部品/.test(message));
      const category = p.category
        .split('・')
        .some((word) => word.length > 1 && query.includes(normalize(word)));
      return { p, score: name && query.includes(name) ? 10 : named ? 5 : category ? 1 : 0 };
    });
    // A broad category must not add castings to a specific glass query when
    // named product matches already exist.
    const namedMatches = candidates.some((c) => c.score >= 5);
    matches = candidates
      .filter((x) => x.score >= (namedMatches ? 5 : 1))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.p);
  }
  return matches;
}
