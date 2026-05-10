const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`)
  return data as T
}

export const api = {
  get:    <T>(path: string)                 => request<T>(path),
  post:   <T>(path: string, body: unknown)  => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)  => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)  => request<T>(path, { method: 'PATCH',   body: JSON.stringify(body) }),
  delete: <T>(path: string)                 => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const res = await fetch(BASE + path, { method: 'POST', credentials: 'include', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as any).error || `HTTP ${res.status}`)
    return data as T
  },
}
