const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

export type Professor = {
  id: number
  name: string
  title: string | null
  category: string
  rmp_score: string | null
  rmp_url: string | null
  updated_at: string
  last_catalog_sync_at: string | null
}

export type ProfessorQuery = {
  q?: string
  category?: string
  limit?: number
  offset?: number
}

export type SyncResult = {
  fetched: number
  inserted: number
  updated: number
  skipped: number
}

export type RMPProfessor = {
  id: string
  profile_url: string
  name: string
  department: string | null
  overall_rating: number | null
  num_ratings: number | null
  percent_take_again: number | null
  level_of_difficulty: number | null
}

export type RMPProfessorPage = {
  school_id: number
  total: number
  page_size: number
  has_next_page: boolean
  next_cursor: string | null
  professors: RMPProfessor[]
}

export type RMPDepartment = {
  name: string
  count: number
}

export type RMPSyncResult = {
  school_id: number
  fetched: number
  inserted: number
  updated: number
  unchanged: number
  deleted: number
  synced_at: string
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>
  }

  let message = `Request failed with status ${response.status}`
  try {
    const body = (await response.json()) as { detail?: string }
    if (body.detail) {
      message = body.detail
    }
  } catch {
    // Keep the generic message when the API does not return JSON.
  }

  throw new Error(message)
}

export async function getProfessors(query: ProfessorQuery = {}, signal?: AbortSignal): Promise<Professor[]> {
  const params = new URLSearchParams()
  params.set("limit", String(query.limit ?? 100))
  params.set("offset", String(query.offset ?? 0))

  if (query.q) {
    params.set("q", query.q)
  }

  if (query.category && query.category !== "all") {
    params.set("category", query.category)
  }

  const response = await fetch(`${API_BASE_URL}/professors?${params.toString()}`, { signal })
  return parseResponse<Professor[]>(response)
}

export async function syncCatalog(adminToken: string): Promise<SyncResult> {
  const response = await fetch(`${API_BASE_URL}/admin/sync-catalog`, {
    method: "POST",
    headers: {
      "X-Admin-Token": adminToken,
    },
  })

  return parseResponse<SyncResult>(response)
}

export async function getRMPProfessors(
  query: { schoolId?: number; q?: string; department?: string; pageSize?: number; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<RMPProfessorPage> {
  const params = new URLSearchParams()
  params.set("school_id", String(query.schoolId ?? 563))
  params.set("page_size", String(query.pageSize ?? 20))

  if (query.q) {
    params.set("q", query.q)
  }

  if (query.department) {
    params.set("department", query.department)
  }

  if (query.cursor) {
    params.set("cursor", query.cursor)
  }

  const response = await fetch(`${API_BASE_URL}/rmp/professors?${params.toString()}`, { signal })
  return parseResponse<RMPProfessorPage>(response)
}

export async function getRMPDepartments(schoolId = 563, signal?: AbortSignal): Promise<RMPDepartment[]> {
  const params = new URLSearchParams()
  params.set("school_id", String(schoolId))

  const response = await fetch(`${API_BASE_URL}/rmp/departments?${params.toString()}`, { signal })
  return parseResponse<RMPDepartment[]>(response)
}

export async function getSavedRMPProfessors(
  query: { schoolId?: number; q?: string; department?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<RMPProfessorPage> {
  const params = new URLSearchParams()
  params.set("school_id", String(query.schoolId ?? 563))
  params.set("limit", String(query.limit ?? 100))
  params.set("offset", String(query.offset ?? 0))

  if (query.q) params.set("q", query.q)
  if (query.department) params.set("department", query.department)

  const response = await fetch(`${API_BASE_URL}/rmp/saved/professors?${params.toString()}`, { signal })
  return parseResponse<RMPProfessorPage>(response)
}

export async function getSavedRMPDepartments(schoolId = 563, signal?: AbortSignal): Promise<RMPDepartment[]> {
  const params = new URLSearchParams({ school_id: String(schoolId) })
  const response = await fetch(`${API_BASE_URL}/rmp/saved/departments?${params.toString()}`, { signal })
  return parseResponse<RMPDepartment[]>(response)
}

export async function syncRMP(adminToken: string): Promise<RMPSyncResult> {
  const response = await fetch(`${API_BASE_URL}/admin/sync-rmp`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken },
  })
  return parseResponse<RMPSyncResult>(response)
}
