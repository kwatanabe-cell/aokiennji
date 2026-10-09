'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { api, errorMessage } from '@/components/api';
export default function Login() {
  const router = useRouter(),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api<{ authenticated: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      router.replace('/admin');
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <Link className="brand" href="/">
          <span className="brand-mark">A</span>
          <span className="brand-words">
            <strong>AOKI ENG</strong>
            <small>アオキエンジ株式会社</small>
          </span>
        </Link>
        <div className="login-icon">
          <LockKeyhole size={26} />
        </div>
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>管理画面にログイン</h1>
        <p>担当者のパスワードを入力してください。</p>
        <form onSubmit={submit}>
          <label>
            パスワード
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? '確認しています…' : 'ログイン'} <ArrowRight size={18} />
          </button>
        </form>
        <Link className="back-link" href="/">
          サイトへ戻る
        </Link>
      </div>
    </main>
  );
}
