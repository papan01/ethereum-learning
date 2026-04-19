const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "/api-proxy";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  return `${base}${p}`;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(input), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
