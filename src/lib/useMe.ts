'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/src/lib/api'
import { User } from '@/src/types'

// 로그인한 사용자. 확인이 끝나기 전(loading)에는 비로그인 화면을 먼저 그리지 않도록 구분해서 돌려줌
export function useMe() {
  const { data, isPending } = useQuery<{ user: User | null }>({
    queryKey: ['me'],
    queryFn: () => api.get('/me'),
    staleTime: Infinity,
  })
  return { user: data?.user ?? null, loading: isPending }
}
