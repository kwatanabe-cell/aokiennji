import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from '../lib/server/db';
import { aiUsageReport } from '../lib/server/ai-usage';
import { DEFAULT_SETTINGS } from '../lib/contracts';
vi.mock('../lib/server/safe-fetch', () => ({ safeFetch: vi.fn() }));
import { safeFetch } from '../lib/server/safe-fetch';
import {
  completedBlocks,
  generateGroundedReply,
  type ReplyContext,
} from '../lib/server/ai-responses';

const network = vi.mocked(safeFetch);
const testDirectory = mkdtempSync(join(tmpdir(), 'aoki-response-usage-'));
const context: ReplyContext = {
  question: '配管の液体を止める部品を相談したい',
  history: [],
  canonical: 'バルブの分野についてご相談いただけます。個別の対応可否は担当者が確認します。',
  facts: [{ id: 'scope', text: '取扱分野：バルブ。個別製品は担当者が確認します。' }],
  confirmedProduct: false,
  settings: { ...DEFAULT_SETTINGS, responseProvider: 'openai' },
  privateText: (text) => /秘密商事/.test(text),
};
const paragraph = {
  text: 'バルブのご相談ですね。配管に流れる液体の種類を教えていただけますか？',
  evidenceIds: ['scope'],
};
const response = {
  status: 200,
  headers: new Headers(),
  body: Buffer.from(''),
  url: 'https://api.openai.com/v1/responses',
};
function sse(event: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}
function mockReply(block: unknown, finish = true) {
  network.mockImplementation(async (_url, options) => {
    options?.onChunk?.(
      sse({ type: 'response.output_text.delta', delta: JSON.stringify({ blocks: [block] }) }),
    );
    if (finish) options?.onChunk?.(sse({ type: 'response.completed' }));
    return response;
  });
}
beforeEach(() => {
  vi.stubEnv('DATA_DIR', testDirectory);
  resetDbForTests();
  network.mockReset();
  vi.stubEnv('OPENAI_API_KEY', 'unit-only');
});
afterEach(() => {
  resetDbForTests();
  vi.unstubAllEnvs();
});
afterAll(() => rmSync(testDirectory, { recursive: true, force: true }));

describe('grounded AI response and streaming', () => {
  it('distinguishes incomplete HTTP 200 generation from validation rejection and retains reported usage', async () => {
    network.mockImplementation(async (_url, options) => {
      options?.onResponse?.(200, new Headers());
      options?.onChunk?.(
        sse({
          type: 'response.incomplete',
          response: { usage: { input_tokens: 50, output_tokens: 9 } },
        }),
      );
      return response;
    });
    const result = await generateGroundedReply(context, {
      usageContext: { scope: 'standalone', turnId: 'incomplete-test' },
    });
    expect(result.provider).toBe('local');
    expect(aiUsageReport({ turnId: 'incomplete-test' }).items[0]).toMatchObject({
      httpStatus: 200,
      outcome: 'network_error',
      errorCode: 'generation_failed',
      usage: { inputTokens: 50, outputTokens: 9 },
    });
  });
  it('emits a validated paragraph before completion, with split UTF-8 SSE chunks', async () => {
    const onText = vi.fn();
    network.mockImplementation(async (_url, options) => {
      const event = sse({
        type: 'response.output_text.delta',
        delta: `{"blocks":[${JSON.stringify(paragraph)}`,
      });
      for (let i = 0; i < event.length; i += 7) options?.onChunk?.(event.slice(i, i + 7));
      expect(onText).toHaveBeenCalledWith(paragraph.text);
      options?.onChunk?.(sse({ type: 'response.output_text.delta', delta: ']}' }));
      options?.onChunk?.(sse({ type: 'response.completed' }));
      return response;
    });
    expect(await generateGroundedReply(context, { onText })).toMatchObject({
      provider: 'openai',
      content: paragraph.text,
    });
    const [url, options] = network.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options?.timeoutMs).toBe(8000);
    const body = JSON.parse(options!.body!);
    expect(body).toMatchObject({
      store: false,
      stream: true,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(JSON.parse(body.input).facts).toEqual(context.facts);
  });
  it.each([
    { text: '価格は999円です。', evidenceIds: ['scope'] },
    { text: '秘密商事から納品します。', evidenceIds: ['scope'] },
    { text: 'バルブを販売しています。', evidenceIds: ['scope'] },
    { text: '注文が完了しました。', evidenceIds: ['scope'] },
    { text: 'ご相談いただけます。', evidenceIds: ['invented'] },
  ])('does not stream an invalid claim: $text', async (block) => {
    mockReply(block);
    const onText = vi.fn();
    expect(await generateGroundedReply(context, { onText })).toMatchObject({
      provider: 'local',
      content: context.canonical,
    });
    expect(onText.mock.calls.flat()).not.toContain(block.text);
  });
  it('rejects hidden values even if a caller accidentally includes them among facts', async () => {
    mockReply({ text: '価格は100円です。', evidenceIds: ['scope'] });
    const result = await generateGroundedReply({
      ...context,
      confirmedProduct: true,
      facts: [{ id: 'scope', text: '100円' }],
      settings: { ...context.settings, flags: { ...context.settings.flags, showPrice: false } },
    });
    expect(result.provider).toBe('local');
  });
  it('falls back on missing credentials, provider errors and incomplete generation', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await generateGroundedReply(context)).reason).toBe('missing_key');
    expect(network).not.toHaveBeenCalled();
    vi.stubEnv('OPENAI_API_KEY', 'unit-only');
    network.mockRejectedValue(new Error('upstream error with secrets'));
    expect((await generateGroundedReply(context)).content).toBe(context.canonical);
    mockReply(paragraph, false);
    expect((await generateGroundedReply(context)).provider).toBe('local');
  });
  it('supports Gemini generation with the same grounding checks', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'unit-only');
    network.mockResolvedValue({
      ...response,
      body: Buffer.from(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ blocks: [paragraph] }) }] } }],
        }),
      ),
    });
    const result = await generateGroundedReply({
      ...context,
      settings: { ...context.settings, responseProvider: 'gemini' },
    });
    expect(result.provider).toBe('gemini');
    expect(network.mock.calls[0][1]?.headers?.['x-goog-api-key']).toBe('unit-only');
  });
  it('parses braces in strings and never emits incomplete JSON blocks', () => {
    expect(completedBlocks('{"blocks":[{"text":"unfinished')).toEqual([]);
    const block = { text: '例は { "abc" } です。', evidenceIds: [] };
    expect(completedBlocks(`{"blocks":[${JSON.stringify(block)}, {"text":`)).toEqual([block]);
  });
});
