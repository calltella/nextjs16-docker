'use client';

import { useState, useTransition } from 'react';
import Navbar from '@/app/components/Navbar';
import { importCsv } from '@/app/dashboard/actions';
import Link from 'next/link';

export default function ImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleImportCsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setImportedCount(null);

    if (!selectedFile) {
      setErrorMsg('CSVファイルを選択してください');
      return;
    }

    if (
      !confirm(
        '既存の全データが削除され、取り込んだCSVファイルの内容でデータベース (transactions_work) が上書きされます。実行しますか？'
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
        setSuccessMsg(`CSVファイルから ${res.count} 件の明細を正常に取り込みました！`);
        setImportedCount(res.count ?? 0);
        setSelectedFile(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">CSVファイルからの取込</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            家計簿CSVファイルを取り込んでデータベースを一括更新・上書きします。
          </p>
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
            {importedCount !== null && (
              <div className="pt-2 border-t border-green-200 dark:border-green-800/60 flex items-center justify-between">
                <span className="text-xs text-green-700 dark:text-green-300">
                  取り込んだデータは月別集計画面で即座に反映されます。
                </span>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-xs shadow transition inline-flex items-center gap-1"
                >
                  月別集計画面を開く →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Import Form Card */}
        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>📥</span> CSVファイルの選択
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              「日付, 収入/支出, 入金/支払方法, 親カテゴリ, 子カテゴリ, 金額, 場所, メモ, 備考, タグ」などのヘッダーを含むCSVに対応しています。
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

            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3">
              <span className="text-base">⚠️</span>
              <div>
                <span className="font-bold">ご注意: </span>
                CSVファイルを取り込むと、現在のデータベースの内容がすべて削除され、CSVファイルの内容で上書き更新されます。
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/dashboard"
                className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium transition"
              >
                キャンセル
              </Link>
              <button
                type="submit"
                disabled={isPending || !selectedFile}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition shadow-md disabled:opacity-50 flex items-center gap-2"
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
                  <span>取り込んで上書き</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
