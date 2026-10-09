'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function SupabaseTestPage() {
  const [clientStatus, setClientStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [clientDetails, setClientDetails] = useState<string>('');
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  // DB Test states
  const [readStatus, setReadStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [readDetails, setReadDetails] = useState<string>('');

  const [writeStatus, setWriteStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [writeDetails, setWriteDetails] = useState<string>('');
  const [lastInsertedId, setLastInsertedId] = useState<number | string | null>(null);

  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [deleteDetails, setDeleteDetails] = useState<string>('');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const envInfo = {
    urlSet: Boolean(supabaseUrl && !supabaseUrl.includes('placeholder')),
    keySet: Boolean(supabaseKey && !supabaseKey.includes('placeholder')),
  };

  const testClientConnection = useCallback(async () => {
    setClientStatus('testing');
    setClientDetails('');
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        setClientStatus('error');
        setClientDetails(error.message);
      } else {
        setClientStatus('success');
        setSessionUser(data.session?.user?.email || null);
        setClientDetails(
          data.session
            ? `セッション取得成功: ログインユーザー (${data.session.user.email})`
            : '接続成功: 未ログイン状態 (Session null)'
        );
      }
    } catch (err: unknown) {
      setClientStatus('error');
      setClientDetails(err instanceof Error ? err.message : '不明なエラーが発生しました');
    }
  }, []);

  const testDbRead = useCallback(async () => {
    setReadStatus('testing');
    setReadDetails('');
    try {
      const supabase = createClient();
      const { data, error, count } = await supabase
        .from('transactions_work')
        .select('*', { count: 'exact' })
        .limit(5);

      if (error) {
        setReadStatus('error');
        setReadDetails(`読込エラー: ${error.message} (${error.code || 'NO_CODE'})`);
      } else {
        setReadStatus('success');
        setReadDetails(
          `読込成功: transactions_work テーブルから正常にデータを取得しました。\n` +
          `総レコード数: ${count ?? 0}件 / 取得サンプル数: ${data?.length ?? 0}件`
        );
      }
    } catch (err: unknown) {
      setReadStatus('error');
      setReadDetails(err instanceof Error ? err.message : '読込テスト中に不明なエラーが発生しました');
    }
  }, []);

  const testDbWrite = useCallback(async (): Promise<number | string | null> => {
    setWriteStatus('testing');
    setWriteDetails('');
    try {
      const supabase = createClient();
      const testRecord = {
        date: new Date().toISOString().split('T')[0],
        type: 'テスト',
        payment_method: 'Supabase接続テスト',
        memo: `接続テスト用データ (${new Date().toLocaleTimeString('ja-JP')})`,
        amount: 100,
      };

      const { data, error } = await supabase
        .from('transactions_work')
        .insert([testRecord])
        .select();

      if (error) {
        setWriteStatus('error');
        setWriteDetails(`書き込みエラー: ${error.message} (${error.code || 'NO_CODE'})`);
        return null;
      } else if (data && data.length > 0) {
        const insertedId = data[0].id;
        setLastInsertedId(insertedId);
        setWriteStatus('success');
        setWriteDetails(
          `書き込み成功: transactions_work テーブルに新規テストレコードを作成しました。\n` +
          `作成レコードID: ${insertedId}\n` +
          `データ内容: 日付=${testRecord.date}, 種別=${testRecord.type}, メモ=${testRecord.memo}`
        );
        return insertedId;
      } else {
        setWriteStatus('success');
        setWriteDetails('書き込み成功: テストレコードが正常に挿入されました');
        return null;
      }
    } catch (err: unknown) {
      setWriteStatus('error');
      setWriteDetails(err instanceof Error ? err.message : '書き込みテスト中に不明なエラーが発生しました');
      return null;
    }
  }, []);

  const testDbDelete = useCallback(async (explicitTargetId?: number | string | null) => {
    setDeleteStatus('testing');
    setDeleteDetails('');
    try {
      const supabase = createClient();
      let targetId = explicitTargetId ?? lastInsertedId;

      // 削除対象IDが存在しない場合は一時レコードを作成して削除テストを実行
      if (!targetId) {
        const tempRecord = {
          date: new Date().toISOString().split('T')[0],
          type: 'テスト',
          payment_method: 'Supabase接続テスト',
          memo: '削除テスト用一時データ',
          amount: 0,
        };
        const { data: insertData, error: insertError } = await supabase
          .from('transactions_work')
          .insert([tempRecord])
          .select();

        if (insertError) {
          setDeleteStatus('error');
          setDeleteDetails(`削除テスト前準備(一時レコード挿入)エラー: ${insertError.message}`);
          return;
        }
        if (insertData && insertData.length > 0) {
          targetId = insertData[0].id;
        }
      }

      if (!targetId) {
        setDeleteStatus('error');
        setDeleteDetails('削除対象のテストレコードIDを取得できませんでした');
        return;
      }

      const { error: deleteError } = await supabase
        .from('transactions_work')
        .delete()
        .eq('id', targetId);

      if (deleteError) {
        setDeleteStatus('error');
        setDeleteDetails(`削除エラー (ID: ${targetId}): ${deleteError.message}`);
      } else {
        setDeleteStatus('success');
        setDeleteDetails(`削除成功: transactions_work テーブルのテストレコード (ID: ${targetId}) を正常に削除しました。`);
        setLastInsertedId(null);
      }
    } catch (err: unknown) {
      setDeleteStatus('error');
      setDeleteDetails(err instanceof Error ? err.message : '削除テスト中に不明なエラーが発生しました');
    }
  }, [lastInsertedId]);

  const handleSingleDelete = useCallback(() => {
    testDbDelete();
  }, [testDbDelete]);

  const runAllTests = useCallback(async () => {
    await testClientConnection();
    await testDbRead();
    const createdId = await testDbWrite();
    await testDbDelete(createdId);
  }, [testClientConnection, testDbRead, testDbWrite, testDbDelete]);

  useEffect(() => {
    let ignore = false;
    async function runInitialTest() {
      const supabase = createClient();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!ignore) {
          if (error) {
            setClientStatus('error');
            setClientDetails(error.message);
          } else {
            setClientStatus('success');
            setSessionUser(data.session?.user?.email || null);
            setClientDetails(
              data.session
                ? `セッション取得成功: ログインユーザー (${data.session.user.email})`
                : '接続成功: 未ログイン状態 (Session null)'
            );
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setClientStatus('error');
          setClientDetails(err instanceof Error ? err.message : '不明なエラーが発生しました');
        }
      }
    }

    runInitialTest();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              Supabase 接続テスト
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Supabaseクライアントと環境変数、データベース操作の診断を行います
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runAllTests}
              className="text-xs bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold px-3.5 py-2 rounded-lg transition shadow-md flex items-center gap-1.5"
            >
              ⚡ 一括テスト実行
            </button>
            <Link
              href="/"
              className="text-xs sm:text-sm font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-lg border border-slate-700 transition"
            >
              ← ホーム
            </Link>
          </div>
        </div>

        {/* Env Variables Status */}
        <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            環境変数チェック
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40 flex items-center justify-between">
              <span className="text-slate-400 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  envInfo.urlSet
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {envInfo.urlSet ? '設定済み' : '未設定 / プレースホルダー'}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/40 flex items-center justify-between">
              <span className="text-slate-400 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  envInfo.keySet
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {envInfo.keySet ? '設定済み' : '未設定 / プレースホルダー'}
              </span>
            </div>
          </div>
        </div>

        {/* Client Connection Status */}
        <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              クライアント接続テスト
            </h2>
            <button
              onClick={testClientConnection}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg transition shadow-sm"
            >
              再テスト
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">ステータス:</span>
              {clientStatus === 'testing' && (
                <span className="inline-flex items-center gap-2 text-amber-400 text-sm font-medium">
                  <svg className="animate-spin h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  テスト実行中...
                </span>
              )}
              {clientStatus === 'idle' && (
                <span className="text-slate-400 text-sm font-medium">未実行</span>
              )}
              {clientStatus === 'success' && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm font-semibold">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  正常接続
                </span>
              )}
              {clientStatus === 'error' && (
                <span className="inline-flex items-center gap-1.5 text-rose-400 text-sm font-semibold">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  接続エラー
                </span>
              )}
            </div>

            {clientDetails && (
              <div className="text-xs font-mono p-3 bg-slate-950/70 rounded-lg text-slate-300 border border-slate-800/80 break-all whitespace-pre-wrap">
                {clientDetails}
              </div>
            )}

            {sessionUser && (
              <div className="text-xs text-indigo-300 bg-indigo-950/50 p-2.5 rounded-lg border border-indigo-800/40">
                ログイン中ユーザー: <span className="font-semibold text-indigo-200">{sessionUser}</span>
              </div>
            )}
          </div>
        </div>

        {/* Database Operations Tests */}
        <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
            <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              データベース操作テスト
            </h2>
            <span className="text-xs text-slate-400">対象: transactions_work</span>
          </div>

          {/* 1. DB Read Test */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">📖 データベース読込テスト</span>
              </div>
              <button
                onClick={testDbRead}
                disabled={readStatus === 'testing'}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition shadow-sm"
              >
                読込テスト実行
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">ステータス:</span>
              {readStatus === 'testing' && (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                  <svg className="animate-spin h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  読込中...
                </span>
              )}
              {readStatus === 'idle' && <span className="text-slate-400">未実行</span>}
              {readStatus === 'success' && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  読込成功
                </span>
              )}
              {readStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  読込エラー
                </span>
              )}
            </div>

            {readDetails && (
              <div className="text-xs font-mono p-3 bg-slate-950/70 rounded-lg text-slate-300 border border-slate-800/80 break-all whitespace-pre-wrap">
                {readDetails}
              </div>
            )}
          </div>

          {/* 2. DB Write Test */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">✍️ データベース書き込みテスト</span>
              </div>
              <button
                onClick={() => { testDbWrite(); }}
                disabled={writeStatus === 'testing'}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition shadow-sm"
              >
                書き込みテスト実行
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">ステータス:</span>
              {writeStatus === 'testing' && (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                  <svg className="animate-spin h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  書き込み中...
                </span>
              )}
              {writeStatus === 'idle' && <span className="text-slate-400">未実行</span>}
              {writeStatus === 'success' && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  書き込み成功
                </span>
              )}
              {writeStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  書き込みエラー
                </span>
              )}
            </div>

            {writeDetails && (
              <div className="text-xs font-mono p-3 bg-slate-950/70 rounded-lg text-slate-300 border border-slate-800/80 break-all whitespace-pre-wrap">
                {writeDetails}
              </div>
            )}
          </div>

          {/* 3. DB Delete Test */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">🗑️ データベース削除テスト</span>
              </div>
              <button
                onClick={handleSingleDelete}
                disabled={deleteStatus === 'testing'}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition shadow-sm"
              >
                削除テスト実行
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">ステータス:</span>
              {deleteStatus === 'testing' && (
                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                  <svg className="animate-spin h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  削除処理中...
                </span>
              )}
              {deleteStatus === 'idle' && <span className="text-slate-400">未実行</span>}
              {deleteStatus === 'success' && (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  削除成功
                </span>
              )}
              {deleteStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  削除エラー
                </span>
              )}
            </div>

            {deleteDetails && (
              <div className="text-xs font-mono p-3 bg-slate-950/70 rounded-lg text-slate-300 border border-slate-800/80 break-all whitespace-pre-wrap">
                {deleteDetails}
              </div>
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="text-xs text-slate-400 hover:text-white underline transition"
          >
            ログインページへ移動 →
          </Link>
          <span className="text-slate-600">|</span>
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-white underline transition"
          >
            ダッシュボードへ移動 →
          </Link>
        </div>
      </div>
    </div>
  );
}
