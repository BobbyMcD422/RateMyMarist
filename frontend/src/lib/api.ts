const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

export type SectionInstructor = {
  id: number
  banner_id: string
  display_name: string
  email: string | null
  primary_indicator: boolean | null
  rmp_profile_url: string | null
  rmp_overall_rating: number | null
  rmp_num_ratings: number | null
}

export type CourseSection = {
  id: number
  term: string
  crn: string
  course_id: number
  subject: string
  course_number: string
  course_title: string
  title: string
  enrollment: number | null
  seats_available: number | null
  instructors: SectionInstructor[]
}

export type CourseSectionPage = {
  total: number
  limit: number
  offset: number
  sections: CourseSection[]
}

export type CourseSummary = {
  id: number
  subject: string
  course_number: string
  title: string
  term: string
  section_count: number
  instructor_count: number
}

export type CoursePage = {
  total: number
  limit: number
  offset: number
  courses: CourseSummary[]
}

export type CourseDetail = {
  id: number
  subject: string
  course_number: string
  title: string
  term: string
  term_description: string
  sections: CourseSection[]
}

export type CourseDirectoryOptions = {
  terms: Array<{ code: string; description: string }>
  subjects: string[]
}

export type CourseSectionQuery = {
  q?: string
  term?: string
  subject?: string
  limit?: number
  offset?: number
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

export type RegistrationSyncResult = {
  term: string
  term_description: string
  source_path: string
  fetched: number
  courses_inserted: number
  courses_updated: number
  instructors_inserted: number
  instructors_updated: number
  sections_inserted: number
  sections_updated: number
  sections_unchanged: number
  sections_deactivated: number
  links_inserted: number
  links_updated: number
  links_deleted: number
  links_skipped: number
  synced_at: string
}

export type InstructorRMPLink = {
  instructor_id: number
  instructor_name: string
  instructor_email: string | null
  rmp_professor_id: number
  rmp_name: string
  rmp_profile_url: string
  match_status: "pending" | "approved" | "rejected"
  match_confidence: number | null
  match_method: string
  reviewed_at: string | null
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

export async function getCourseSections(
  query: CourseSectionQuery = {},
  signal?: AbortSignal,
): Promise<CourseSectionPage> {
  const params = new URLSearchParams()
  params.set("limit", String(query.limit ?? 100))
  params.set("offset", String(query.offset ?? 0))

  if (query.q) params.set("q", query.q)
  if (query.term) params.set("term", query.term)
  if (query.subject && query.subject !== "all") params.set("subject", query.subject)

  const response = await fetch(`${API_BASE_URL}/sections?${params.toString()}`, { signal })
  return parseResponse<CourseSectionPage>(response)
}

export async function getCourses(
  query: CourseSectionQuery = {},
  signal?: AbortSignal,
): Promise<CoursePage> {
  const params = new URLSearchParams()
  params.set("limit", String(query.limit ?? 100))
  params.set("offset", String(query.offset ?? 0))

  if (query.q) params.set("q", query.q)
  if (query.term) params.set("term", query.term)
  if (query.subject && query.subject !== "all") params.set("subject", query.subject)

  const response = await fetch(`${API_BASE_URL}/courses?${params.toString()}`, { signal })
  return parseResponse<CoursePage>(response)
}

export async function getCourse(courseId: number, term?: string, signal?: AbortSignal): Promise<CourseDetail> {
  const params = new URLSearchParams()
  if (term) params.set("term", term)

  const suffix = params.size ? `?${params.toString()}` : ""
  const response = await fetch(`${API_BASE_URL}/courses/${courseId}${suffix}`, { signal })
  return parseResponse<CourseDetail>(response)
}

export async function getCourseDirectoryOptions(
  term?: string,
  signal?: AbortSignal,
): Promise<CourseDirectoryOptions> {
  const params = new URLSearchParams()
  if (term) params.set("term", term)

  const response = await fetch(`${API_BASE_URL}/sections/options?${params.toString()}`, { signal })
  return parseResponse<CourseDirectoryOptions>(response)
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

export async function syncRegistrationJson(adminToken: string): Promise<RegistrationSyncResult> {
  const response = await fetch(`${API_BASE_URL}/admin/sync-registration`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken },
  })
  return parseResponse<RegistrationSyncResult>(response)
}

export async function getInstructorRMPLinks(
  adminToken: string,
  status = "pending",
): Promise<InstructorRMPLink[]> {
  const params = new URLSearchParams({ status })
  const response = await fetch(`${API_BASE_URL}/admin/instructor-rmp-links?${params.toString()}`, {
    headers: { "X-Admin-Token": adminToken },
  })
  return parseResponse<InstructorRMPLink[]>(response)
}

export async function reviewInstructorRMPLink(
  adminToken: string,
  instructorId: number,
  rmpProfessorId: number,
  matchStatus: "approved" | "rejected",
): Promise<InstructorRMPLink> {
  const response = await fetch(`${API_BASE_URL}/admin/instructor-rmp-links/${instructorId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": adminToken,
    },
    body: JSON.stringify({ rmp_professor_id: rmpProfessorId, match_status: matchStatus }),
  })
  return parseResponse<InstructorRMPLink>(response)
}
