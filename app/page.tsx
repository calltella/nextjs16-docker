import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col justify-center items-center p-6">
      <main className="max-w-xl text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          シンプル家計簿
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          毎日の収支を簡単・スピーディに記録・管理できます。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-md transition"
          >
            家計簿を開く
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium rounded-xl border border-gray-300 dark:border-gray-700 transition"
          >
            ログインページ
          </Link>
          <Link
            href="/card-types"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-md transition"
          >
            カード種類管理
          </Link>
          <Link
            href="/supabase-test"
            className="px-6 py-3 bg-indigo-500/10 dark:bg-indigo-950/40 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium rounded-xl border border-indigo-200 dark:border-indigo-800 transition"
          >
            Supabase接続テスト
          </Link>
        </div>
      </main>
    </div>
  );
}
