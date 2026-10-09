'use client';
import { useEffect, useState } from 'react';
import type { AuditEvent } from '@/lib/contracts';
import { api, datetime, errorMessage } from './api';
import { Empty, Notice } from './AdminCommon';
export default function AdminAudit() {
  const [items, setItems] = useState<AuditEvent[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    api<AuditEvent[]>('/api/admin/audit')
      .then(setItems)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <>
      <Notice message={error} type="error" />
      <section className="admin-card">
        {items.length ? (
          <ul className="activity-list">
            {items.map((x) => (
              <li key={x.id}>
                <span>
                  {x.summary}
                  <small>
                    {x.action} · {x.entityId.slice(0, 8)}
                  </small>
                </span>
                <time>{datetime(x.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="まだ操作履歴はありません" />
        )}
      </section>
    </>
  );
}
