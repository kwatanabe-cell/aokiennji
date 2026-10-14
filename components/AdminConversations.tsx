'use client';
import { useEffect, useState } from 'react';
import {
  RESEARCH_ASPECT_LABELS,
  type Conversation,
  type ChatMessage,
  type Inquiry,
  type ResearchNote,
} from '@/lib/contracts';

const sourceLabels: Record<ResearchNote['findings'][number]['source'], string> = {
  maker: 'メーカー',
  retailer: '通販サイト',
  carrier: '運送会社',
  supplier: '仕入先',
  other: 'その他',
};
const checkLabels: Record<ResearchNote['findings'][number]['check'], string> = {
  matched: 'ページで確認済み',
  partial: '一部のみ確認',
  mismatch: 'ページの記載と不一致',
  unreachable: '自動取得できず未確認',
};
import { api, datetime, errorMessage } from './api';
import { Empty, Modal, Notice, useNotice } from './AdminCommon';
type Detail = { conversation: Conversation; messages: ChatMessage[]; research: ResearchNote[] };
// A chat with its staff-only research notes. Also opened from a quote request.
export function ConversationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<Detail>(`/api/admin/conversations/${id}`)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (error)
    return (
      <Modal title="会話" onClose={onClose}>
        <Notice message={error} type="error" />
      </Modal>
    );
  if (!detail) return null;
  return (
    <Modal title={detail.conversation.title} wide onClose={onClose}>
      {detail.research?.length ? (
        <section className="research-notes">
          <h3>AI調査メモ（担当者用・お客様には表示されません）</h3>
          {detail.research.map((note) => (
            <div className="research-note" key={note.id}>
              <p>
                <strong>{note.subject}</strong>
              </p>
              <p className="muted">
                {datetime(note.createdAt)}・調べた項目：
                {note.aspects.map((a) => RESEARCH_ASPECT_LABELS[a]).join('・')}
                {note.destination ? `・お届け先：${note.destination}` : ''}
                {note.quantity ? `・数量：${note.quantity}` : ''}
                ・調査の判定：{note.decidedBy === 'jev' ? 'Jev' : 'ルール'}
              </p>
              {note.status === 'running' && <p>調査中です。しばらくしてから開き直してください。</p>}
              {note.status === 'failed' && (
                <p>
                  {note.error === 'insufficient_quota'
                    ? 'OpenAIの利用残高（クレジット）が不足しているため、調査できませんでした。'
                    : '調査を完了できませんでした。'}
                </p>
              )}
              {note.summary && <p className="preline">{note.summary}</p>}
              {note.findings.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>ページの記載</th>
                        <th>出典</th>
                        <th>確認</th>
                      </tr>
                    </thead>
                    <tbody>
                      {note.findings.map((f, i) => (
                        <tr key={i}>
                          <td>{RESEARCH_ASPECT_LABELS[f.aspect]}</td>
                          <td>
                            <strong>{f.value}</strong>
                            {f.note && <small>{f.note}</small>}
                          </td>
                          <td>
                            <a href={f.url} target="_blank" rel="noopener noreferrer">
                              {f.supplierName ? `仕入先：${f.supplierName}` : f.title || f.url}
                            </a>
                            <small>{sourceLabels[f.source]}</small>
                          </td>
                          <td>
                            {checkLabels[f.check]}
                            {f.relevance !== null && (
                              <small>品目の一致 {Math.round(f.relevance * 100)}%</small>
                            )}
                            {((f.relevance !== null && f.relevance < 0.5) ||
                              f.itemOnPage === false) && (
                              <small className="research-warning">別の型式・サイズの可能性</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <p className="muted">
            「ページの記載と不一致」はAIの読み違いの可能性が高い項目です。「一部のみ確認」は数値の一部や短い語しかページで確認できなかった項目です。「自動取得できず未確認」はサイトが自動取得を受け付けないため照合できなかった項目です。「別の型式・サイズの可能性」は、ページにお客様の型番・サイズが見当たらないか、品目の一致が低い項目です。お客様への回答前に出典をご確認ください。
          </p>
        </section>
      ) : null}
      <div className="admin-chat-history">
        {detail.messages.map((m) => (
          <div className={`chat-message ${m.role}`} key={m.id}>
            <small>
              {m.role === 'user' ? 'お客様' : 'ご案内'} · {datetime(m.createdAt)}
            </small>
            <p className="chat-bubble">{m.content}</p>
            {m.evidence?.map((e, i) => (
              <p className="muted" key={i}>
                参照：{e.title} {e.url}
              </p>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
export default function AdminConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [viewing, setViewing] = useState<string | null>(null),
    [edit, setEdit] = useState<Inquiry | null>(null),
    [busy, setBusy] = useState(false);
  const n = useNotice();
  async function load() {
    try {
      const [c, i] = await Promise.all([
        api<Conversation[]>('/api/admin/conversations'),
        api<Inquiry[]>('/api/admin/inquiries'),
      ]);
      setConversations(c);
      setInquiries(i);
    } catch (e) {
      n.fail(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  function view(id: string) {
    setViewing(id);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    try {
      await api(`/api/admin/inquiries/${edit.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: edit.status, notes: edit.notes }),
      });
      setEdit(null);
      n.success('対応状況を保存しました');
      load();
    } catch (e) {
      n.fail(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice message={n.error || n.message} type={n.error ? 'error' : 'success'} />
      <section className="admin-card">
        <h2>担当者へのお問い合わせ</h2>
        {inquiries.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>お客様</th>
                  <th>内容</th>
                  <th>状態</th>
                  <th>受付日時</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inquiries.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>
                        {i.company} {i.name}
                      </strong>
                      <small>{i.email}</small>
                    </td>
                    <td>{i.message.slice(0, 80)}</td>
                    <td>{{ new: '未対応', in_progress: '対応中', resolved: '完了' }[i.status]}</td>
                    <td>{datetime(i.createdAt)}</td>
                    <td>
                      <button className="button secondary small" onClick={() => setEdit({ ...i })}>
                        確認
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="まだお問い合わせはありません" />
        )}
      </section>
      <section className="admin-card">
        <h2>チャットの履歴</h2>
        {conversations.length ? (
          <div className="conversation-list">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => view(c.id)}>
                <strong>{c.title}</strong>
                <span>{c.status === 'handed_off' ? '担当者に引継ぎ済み' : '相談中'}</span>
                <small>{datetime(c.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="まだチャットの履歴はありません" />
        )}
      </section>
      {viewing && <ConversationDetail id={viewing} onClose={() => setViewing(null)} />}
      {edit && (
        <Modal title="お問い合わせの対応" onClose={() => setEdit(null)}>
          <form className="admin-form" onSubmit={save}>
            <p>
              <strong>
                {edit.company} {edit.name}
              </strong>
              <br />
              {edit.email}
            </p>
            <p className="preline">{edit.message}</p>
            {edit.conversationId && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  view(edit.conversationId!);
                  setEdit(null);
                }}
              >
                関連する会話を見る
              </button>
            )}
            <label>
              対応状態
              <select
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value as Inquiry['status'] })}
              >
                <option value="new">未対応</option>
                <option value="in_progress">対応中</option>
                <option value="resolved">完了</option>
              </select>
            </label>
            <label>
              社内メモ
              <textarea
                rows={5}
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
              />
            </label>
            {n.error && <Notice message={n.error} type="error" />}
            <button className="button primary" disabled={busy}>
              保存する
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
