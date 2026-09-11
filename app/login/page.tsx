'use client';

import { useState, type SubmitEventHandler } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// app/login/page.tsx
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setMessage({ text: 'メールアドレスとパスワードを入力してください。', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setMessage({ text: error.message, type: 'error' });
      } else {
        setMessage({ text: 'ログインに成功しました。ダッシュボードへ移動します...', type: 'success' });
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 800);
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setMessage({ text: error.message, type: 'error' });
      } else {
        setMessage({
          text: '確認メールを送信しました。（ローカル等で autoconfirm の場合はそのままログイン可能です）',
          type: 'info',
        });
      }
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    setMessage({ text: 'ログアウトしました。', type: 'info' });
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background gradient decorative shapes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block hover:opacity-80 transition">
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white text-lg shadow-lg shadow-blue-500/20">
                💰
              </span>
              家計簿 App
            </h1>
          </Link>
          <p className="text-sm text-slate-400">
            {mode === 'signin' ? 'アカウントにサインインしてください' : '新しいアカウントを作成してください'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/60 rounded-xl border border-slate-800/80 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition ${mode === 'signin'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setMessage(null);
              }}
              className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition ${mode === 'signup'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              新規登録
            </button>
          </div>

          {/* Alert Message */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-2xl text-xs sm:text-sm border ${message.type === 'error'
                ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                : message.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : 'bg-sky-950/40 border-sky-800/50 text-sky-300'
                }`}
            >
              {message.text}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                メールアドレス
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                パスワード
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/80 focus:border-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  処理中...
                </>
              ) : mode === 'signin' ? (
                'ログイン'
              ) : (
                'アカウント登録'
              )}
            </button>
          </form>

          {/* Quick Actions / Sign Out */}
          <div className="mt-6 pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="hover:text-slate-200 underline transition"
            >
              ログアウト
            </button>
            <Link href="/" className="hover:text-slate-200 transition">
              ← ホームへ戻る
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500">
          <Link href="/supabase-test" className="hover:text-slate-400 underline transition">
            Supabase 接続診断ページへ
          </Link>
        </div>
      </div>
    </div>
  );
}
