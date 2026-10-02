'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import Navbar from '@/app/components/Navbar';
import {
  importCsv,
  getWorkTransactionsSummary,
  saveWorkToNormalizedTransactions,
  initializeAndMigrateDatabase,
} from '@/app/dashboard/actions';
import Link from 'next/link';

interface WorkSummary {
  count: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  minDate: string;
  maxDate: string;
}

export default function ImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [workSummary, setWorkSummary] = useState<WorkSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadSummary = useCallback(async () => {
    const res = await getWorkTransactionsSummary();
    if (res.data) {
      setWorkSummary(res.data);
    } else {
      setWorkSummary(null);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    getWorkTransactionsSummary().then((res) => {
      if (!ignore) {
        if (res.data) {
          setWorkSummary(res.data);
        } else {
          setWorkSummary(null);
        }
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const handleImportCsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setErrorMsg('CSVファイルを選択してください');
      return;
    }

    if (
      !confirm(
        '作業用テーブル (transactions_work) の内容が選択したCSVファイルの内容で上書きされます。実行しますか？'
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    startTransition(async () => {
      const res = await importCsv(formData);
      if (!res.success) {
        setErrorMsg(res.error || 'CSVの取り込みに失敗しました');
      } else {
        setSuccessMsg(`CSVファイルから ${res.count} 件の明細を作業用テーブル (transactions_work) に正常に取り込みました！分析結果を確認し、下のボタンで正規化テーブルへ保存してください。`);
        setSelectedFile(null);
        await loadSummary();
      }
    });
  };

  const handleInitializeAndMigrateDatabase = async () => {
    if (
      !confirm(
        `【アプリ側でのテーブル作成 & データ正規化】\n\n` +
        `データベースに必要な正規化テーブル（transaction_types, payment_methods, parent_categories, child_categories, card_settings, bank_accounts, bank_balances, transactions）が存在しない場合は自動作成し、\n` +
        `作業用テーブル (transactions_work) のデータを正規化して transactions テーブルに全件保存します。\n\n実行しますか？`
      )
    ) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await initializeAndMigrateDatabase();
      if (!res.success) {
        setErrorMsg(res.error || 'アプリ側でのテーブル作成・正規化処理に失敗しました');
      } else {
        setSuccessMsg(`🎉 アプリ側で必要なテーブルを自動作成し、作業用テーブルから ${res.count} 件の明細を正規化テーブル (transactions) に保存・同期しました！`);
        await loadSummary();
      }
    });
  };

  const handleSaveToNormalizedTransactions = async () => {
    if (!workSummary || workSummary.count === 0) {
      setErrorMsg('保存対象の作業用データが存在しません。CSVファイルを先に取り込んでください。');
      return;
    }

    if (
      !confirm(
        `【重要警告】正規化テーブル (transactions) 内の既存データがすべて削除されます！\n\n` +
        `作業用テーブル (transactions_work) の全 ${workSummary.count} 件のデータで transactions テーブルを上書き更新しますか？`
      )
    ) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await saveWorkToNormalizedTransactions();
      if (!res.success) {
        setErrorMsg(res.error || 'transactions テーブルへの保存に失敗しました');
      } else {
        setSuccessMsg(`🎉 既存の全データを削除し、作業用データから ${res.count} 件の明細を正規化テーブル (transactions) に正常に保存・同期しました！`);
        await loadSummary();
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">CSVファイルからの取込 & データ分析保存</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            家計簿CSVファイルを作業用テーブル (transactions_work) に取り込んでデータ分析を行い、正規化テーブル (transactions) に一括保存できます。
          </p>
        </div>

        {/* Database Initialization Action Banner */}
        <div className="p-5 bg-gradient-to-r from-purple-500 via-indigo-600 to-blue-600 rounded-2xl text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-purple-100 font-bold uppercase tracking-wider">
              🛠️ データベース自動セットアップ（アプリ側での実行）
            </div>
            <div className="text-xs text-purple-200 mt-1">
              Supabaseでの手動SQL実行を行わず、アプリ側でテーブル群の作成・正規化・データ移行を直接実行できます。
            </div>
          </div>

          <button
            type="button"
            onClick={handleInitializeAndMigrateDatabase}
            disabled={isPending}
            className="whitespace-nowrap px-5 py-2.5 bg-white text-indigo-700 hover:bg-purple-50 font-bold text-xs rounded-xl shadow transition disabled:opacity-50"
          >
            {isPending ? 'セットアップ実行中...' : 'テーブル作成 & データ正規化を実行'}
          </button>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-200 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-xl space-y-3">
            <div className="font-semibold text-base flex items-center gap-2">
              <span className="text-xl">✅</span>
              <span>{successMsg}</span>
            </div>
            <div className="pt-2 border-t border-green-200 dark:border-green-800/60 flex items-center justify-between">
              <span className="text-xs text-green-700 dark:text-green-300">
                正規化テーブルに保存されたデータは月別集計画面で閲覧できます。
              </span>
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-xs shadow transition inline-flex items-center gap-1"
              >
                月別集計画面を開く →
              </Link>
            </div>
          </div>
        )}

        {/* Step 1: Import CSV Form Card */}
        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold">
                STEP 1
              </span>
              <h2 className="text-lg font-bold">CSVファイルの選択・作業用テーブルへの取込</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              「日付, 収入/支出, 入金/支払方法, 親カテゴリ, 子カテゴリ, 金額, 場所, メモ, 備考, タグ」などのヘッダーを含むCSVファイルを取り込みます。
            </p>
          </div>

          <form onSubmit={handleImportCsv} className="space-y-6">
            <div className="p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-center space-y-3">
              <input
                type="file"
                accept=".csv"
                id="csv-file-input"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label
                htmlFor="csv-file-input"
                className="cursor-pointer inline-flex flex-col items-center justify-center space-y-2"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xl">
                  📁
                </div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {selectedFile ? selectedFile.name : 'クリックしてCSVファイルを選択'}
                </div>
                <div className="text-xs text-gray-400">
                  {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : '.csv 形式のファイルのみ'}
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending || !selectedFile}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition shadow-md disabled:opacity-50 flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>取り込み処理中...</span>
                  </>
                ) : (
                  <span>CSVを作業用テーブル (transactions_work) に取り込む</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Step 2: Work Data Analysis & Save to Transactions Button */}
        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold">
                STEP 2
              </span>
              <h2 className="text-lg font-bold">取り込みデータの分析 & 正規化テーブルへの保存</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              transactions_work 内のデータ件数・集計金額を分析し、既存データを全削除して正規化テーブル (transactions) にコピー保存します。
            </p>
          </div>

          {workSummary ? (
            <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-blue-200/60 dark:border-blue-800/60 pb-3">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  📊 取り込みデータ分析結果 (transactions_work)
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 bg-blue-600 text-white rounded-full">
                  合計 {workSummary.count} 件
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-gray-500 dark:text-gray-400 font-bold">総収入金額</div>
                  <div className="text-lg font-extrabold text-green-600 dark:text-green-400 mt-0.5">
                    ¥{workSummary.totalIncome.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 dark:text-gray-400 font-bold">総支出金額</div>
                  <div className="text-lg font-extrabold text-red-600 dark:text-red-400 mt-0.5">
                    ¥{workSummary.totalExpense.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 dark:text-gray-400 font-bold">差引収支</div>
                  <div className={`text-lg font-extrabold mt-0.5 ${workSummary.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600'}`}>
                    ¥{workSummary.balance.toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-gray-500 dark:text-gray-400 font-bold">対象期間</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mt-1">
                    {workSummary.minDate} 〜 {workSummary.maxDate}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-2xl text-center text-xs text-gray-500">
              作業用テーブル (transactions_work) にデータがありません。STEP 1 でCSVファイルを取り込んでください。
            </div>
          )}

          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-start gap-3">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-bold">全削除・完全置換のご注意: </span>
              下のボタンを押すと、正規化テーブル (transactions) 内の<span className="font-bold underline text-red-600 dark:text-red-400">既存のデータがすべて削除</span>され、transactions_work の全 {workSummary?.count || 0} 件のデータで上書き保存されます。
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveToNormalizedTransactions}
              disabled={isPending || !workSummary || workSummary.count === 0}
              className="w-full sm:w-auto px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>保存・同期処理中...</span>
                </>
              ) : (
                <span>既存データを全削除して transactions テーブルに保存</span>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
