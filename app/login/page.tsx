'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else setMessage('確認メールを送信しました（ローカルでは autoconfirm の場合すぐログイン可）')
  }

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
    else {
      setMessage('ログイン成功')
      router.push('/dashboard')
      router.refresh()
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <input
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 w-full"
      />
      <input
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full"
      />
      <div className="flex gap-2">
        <button onClick={handleSignIn} className="bg-blue-500 text-white px-4 py-2">
          ログイン
        </button>
        <button onClick={handleSignUp} className="bg-green-500 text-white px-4 py-2">
          新規登録
        </button>
        <button onClick={handleSignOut} className="bg-gray-500 text-white px-4 py-2">
          ログアウト
        </button>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}