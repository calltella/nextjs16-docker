import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
// lib/supabase/server.ts
export async function createClient() {
  const cookieStore = await cookies()
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL)
  return createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: 'sb-auth-token',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component では無視してOK
          }
        },
      },
    }
  )
}