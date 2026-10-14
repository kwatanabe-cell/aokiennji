'use client';
import { useEffect, useState } from 'react';
import type { AiCall, AiUsageReport, ChatMessage, Conversation } from '@/lib/contracts';
import { api, datetime, errorMessage, localDateTime } from './api';
import { Empty, Modal, Notice } from './AdminCommon';

const outcomes: Record<AiCall['outcome'], string> = {
  pending: '実行中・完了記録なし',
  accepted: '採用',
  rejected: '検証で不採用',
  http_error: 'HTTPエラー',
  network_error: '接続・生成エラー',
};
const scopes = { chat: 'お客様の質問', connection_check: '接続確認', standalone: 'その他' };
export default function AdminAiUsage() {
  const [data, setData] = useState<AiUsageReport | null>(null);
  const [provider, setProvider] = useState('');
  const [scope, setScope] = useState('chat');
  const [period, setPeriod] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState<{
    conversation: Conversation;
    messages: ChatMessage[];
    turnId?: string;
  } | null>(null);
  async function viewConversation(call: AiCall) {
    try {
      const value = await api<{ conversation: Conversation; messages: ChatMessage[] }>(
        `/api/admin/conversations/${call.context.conversationId}`,
      );
      setDetail({ ...value, turnId: call.context.turnId });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '500' });
    if (provider) query.set('provider', provider);
    if (scope) query.set('scope', scope);
    if (period !== 'all')
      query.set('since', new Date(Date.now() - Number(period) * 86400000).toISOString());
    api<AiUsageReport>(`/api/admin/ai-usage?${query}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider, scope, period, refresh]);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-usage-${localDateTime(new Date().toISOString()).slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Notice message={error} type="error" />
      <section className="admin-card">
        <h2>APIごとの用途と使用量</h2>
        <p>
          Jevは質問の意図・取扱分野・資料候補の判定、OpenAIは根拠に基づく相談文の生成に使います。価格の計算や非公開情報の案内など、ローカル処理だけの回答ではAPIを呼びません。
        </p>
        <p className="help">
          記録開始：
          {data?.recordingStartedAt
            ? datetime(data.recordingStartedAt)
            : 'まだ呼び出しがありません'}
          。記録開始前の使用量は復元できません。キー・質問本文・仕入先の非公開情報はこの記録に保存しません。
        </p>
      </section>
      <div className="admin-toolbar ai-usage-filters">
        <label>
          API
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            aria-label="APIで絞り込み"
          >
            <option value="">すべて</option>
            <option value="openai">OpenAI</option>
            <option value="jev">Jev / TypeSafe</option>
          </select>
        </label>
        <label>
          用途
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="用途で絞り込み"
          >
            <option value="">すべて</option>
            <option value="chat">お客様の質問</option>
            <option value="connection_check">接続確認</option>
            <option value="standalone">その他</option>
          </select>
        </label>
        <label>
          期間
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="期間で絞り込み"
          >
            <option value="all">記録開始から</option>
            <option value="1">直近24時間</option>
            <option value="7">直近7日間</option>
            <option value="30">直近30日間</option>
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => setRefresh((n) => n + 1)}
          disabled={loading}
        >
          再読み込み
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={download}
          disabled={!data || loading}
        >
          表示中の記録をJSON保存
        </button>
      </div>
      {loading ? (
        <div className="state-box">利用記録を読み込んでいます…</div>
      ) : (
        data && (
          <>
            <div className="admin-two-col">
              {data.summaries
                .filter((s) => !provider || s.provider === provider)
                .map((s) => (
                  <section className="admin-card" key={s.provider}>
                    <h2>{s.provider === 'openai' ? 'OpenAI' : 'Jev / TypeSafe'}</h2>
                    <dl className="ai-usage-summary">
                      <div>
                        <dt>呼び出し</dt>
                        <dd>{s.calls.toLocaleString()}回</dd>
                      </div>
                      <div>
                        <dt>HTTP成功</dt>
                        <dd>{s.httpSuccess}回</dd>
                      </div>
                      <div>
                        <dt>結果を採用</dt>
                        <dd>{s.accepted}回</dd>
                      </div>
                      <div>
                        <dt>検証で不採用</dt>
                        <dd>{s.rejected}回</dd>
                      </div>
                      <div>
                        <dt>エラー / 完了記録なし</dt>
                        <dd>
                          {s.failed} / {s.pending}回
                        </dd>
                      </div>
                      <div>
                        <dt>入力トークン</dt>
                        <dd>{s.inputTokens?.toLocaleString() ?? '未取得'}</dd>
                      </div>
                      <div>
                        <dt>出力トークン</dt>
                        <dd>{s.outputTokens?.toLocaleString() ?? '未取得'}</dd>
                      </div>
                      <div>
                        <dt>キャッシュ済み入力</dt>
                        <dd>{s.cachedInputTokens?.toLocaleString() ?? '未取得'}</dd>
                      </div>
                    </dl>
                    <p className="help">
                      使用量を取得できたのは{s.usageReportedCalls} / {s.calls}
                      回。トークンは取得済み分だけの合計です。未取得をゼロとして扱いません。料金は提供元の請求画面で確認してください。
                    </p>
                  </section>
                ))}
            </div>
            <section className="admin-card table-scroll ai-usage-details">
              <h2>呼び出しの明細</h2>
              <p className="help">
                条件に一致する{data.total}件の集計と、最新{data.items.length}
                件の明細を表示します（明細は最大500件）。
              </p>
              {data.items.length ? (
                <table className="data-table ai-usage-table">
                  <thead>
                    <tr>
                      <th>時刻 / API</th>
                      <th>用途 / モデル</th>
                      <th>HTTP / 採用結果</th>
                      <th>時間 / トークン</th>
                      <th>リクエスト・会話</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((call) => (
                      <tr key={call.id}>
                        <td>
                          {datetime(call.createdAt)}
                          <small>{call.provider}</small>
                        </td>
                        <td>
                          {
                            {
                              classification: '質問・分野の判定',
                              response: '相談文の生成',
                              research: '価格・納期の調査',
                              research_decision: '調査の判定',
                            }[call.purpose]
                          }
                          <small>
                            {scopes[call.context.scope]} · {call.model}
                          </small>
                        </td>
                        <td>
                          {call.httpStatus ?? '未取得'} / {outcomes[call.outcome]}
                          {call.errorCode && <small>{call.errorCode}</small>}
                        </td>
                        <td>
                          {call.durationMs === null
                            ? '計測中'
                            : `${(call.durationMs / 1000).toFixed(2)}秒`}
                          <small>
                            {call.usage
                              ? `入力 ${call.usage.inputTokens} / 出力 ${call.usage.outputTokens}`
                              : '使用量は未取得'}
                          </small>
                        </td>
                        <td>
                          {call.context.conversationId && (
                            <button
                              type="button"
                              className="button secondary small"
                              onClick={() => viewConversation(call)}
                            >
                              質問と回答を確認
                            </button>
                          )}
                          <details>
                            <summary>リクエスト詳細</summary>
                            <p>
                              {call.method} {call.endpoint}
                            </p>
                            <p>送信サイズ：{call.requestBytes.toLocaleString()} bytes</p>
                            <pre>{JSON.stringify(call.requestShape, null, 2)}</pre>
                            {call.requestId && <p>提供元リクエストID：{call.requestId}</p>}
                            <p>呼び出しID：{call.id}</p>
                            {call.context.turnId && <p>質問ID：{call.context.turnId}</p>}
                            {call.context.conversationId && (
                              <p>会話ID：{call.context.conversationId}</p>
                            )}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty
                  title="この条件のAPI呼び出し記録はありません"
                  detail="ローカル処理だけの質問は記録に含まれません。"
                />
              )}
            </section>
          </>
        )
      )}
      {detail && (
        <Modal title="APIを使った会話の記録" wide onClose={() => setDetail(null)}>
          <p>{detail.conversation.title}</p>
          <div className="admin-chat-history">
            {detail.messages.map((m) => (
              <div
                className={`chat-message ${m.role} ${m.id === detail.turnId ? 'ai-usage-selected' : ''}`}
                key={m.id}
              >
                <small>
                  {m.role === 'user' ? 'お客様' : 'ご案内'} · {datetime(m.createdAt)}
                  {m.id === detail.turnId ? ' · このAPI呼び出しの質問' : ''}
                </small>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
