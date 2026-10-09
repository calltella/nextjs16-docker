'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUserEmail(user?.email || null);
      } catch {
        setUserEmail(null);
      } finally {
        setLoading(false);
      }
    }
    checkUser();
  }, [supabase]);

  const handleSignOut = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await supabase.auth.signOut();
      setUserEmail(null);
      setMessage('ログアウトしました。');
    } catch (error) {
      console.error('Sign out error:', error);
      setMessage('ログアウト処理でエラーが発生しました。');
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      <main className="max-w-xl text-center space-y-6 z-10 w-full">
        <div className="inline-block p-3 bg-blue-600 text-white rounded-2xl text-2xl shadow-lg shadow-blue-500/20 mb-2">
          💰
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          家計簿 App
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300">
          毎日の収支を簡単・スピーディに記録・管理できます。
        </p>

        {/* User Session Info & Alert Message */}
        {message && (
          <div className="p-3 bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 rounded-xl text-xs font-semibold">
            {message}
          </div>
        )}

        {userEmail && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2">
            <span>👤 ログイン中:</span>
            <span className="font-bold underline">{userEmail}</span>
          </div>
        )}

        {/* Home Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
          >
            <span>📊</span> 家計簿を開く
          </Link>

          <Link
            href="/login"
            className="px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold text-sm rounded-xl border border-gray-300 dark:border-gray-700 transition flex items-center justify-center gap-1.5"
          >
            <span>🔑</span> ログイン画面
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={loading}
            className="px-6 py-3 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-bold text-sm rounded-xl border border-red-200 dark:border-red-800/80 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <span>🚪</span> ログアウト
          </button>
        </div>

        {/* Additional Navigation Links */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-wrap justify-center gap-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <Link href="/cards" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
            💳 カード管理
          </Link>
          <Link href="/accounts" className="hover:text-teal-600 dark:hover:text-teal-400 transition">
            🏦 口座管理
          </Link>
          <Link href="/import" className="hover:text-purple-600 dark:hover:text-purple-400 transition">
            📥 CSV取込
          </Link>
          <Link href="/supabase-test" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
            ⚙️ Supabase接続テスト
          </Link>
        </div>
      </main>
    </div>
  );
}
