import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// proxy.ts

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('=== Middleware Debug ===')
  console.log('URL:', supabaseUrl)
  console.log('Key exists:', !!supabaseKey)
  console.log('Path:', request.nextUrl.pathname)
  console.log('Cookies:', request.cookies.getAll().map(c => c.name))

  if (!supabaseUrl || !supabaseKey) {
    console.error('環境変数が読み込めていません！')
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: {
      name: 'sb-auth-token',
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  }
  )

  //const { data: { user } } = await supabase.auth.getUser()
  const { data: { user }, error } = await supabase.auth.getUser()
  console.log('User:', user?.email ?? 'null')
  console.log('Error:', error?.message ?? 'none')
  console.log('========================')

  // /login に来たとき、既にログイン済みなら /dashboard へ
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  // 未ログインで /dashboard に来たらログインへ
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}