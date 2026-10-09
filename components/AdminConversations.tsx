'use client';
import { useEffect, useState } from 'react';
import type { Conversation, ChatMessage, Inquiry } from '@/lib/contracts';
import { api, datetime, errorMessage } from './api';
import { Empty, Modal, Notice, useNotice } from './AdminCommon';
export default function AdminConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [detail, setDetail] = useState<{ conversation: Conversation; messages: ChatMessage[] } | null>(
      null,
    ),
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
  async function view(id: string) {
    try {
      setDetail(await api(`/api/admin/conversations/${id}`));
    } catch (e) {
      n.fail(errorMessage(e));
    }
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
      {detail && (
        <Modal title={detail.conversation.title} wide onClose={() => setDetail(null)}>
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
      )}
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
