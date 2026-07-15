import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardList, DatabaseZap, ExternalLink, FileJson, Link2, Moon, Plus, RefreshCw, Search, ShieldCheck, Star, Sun, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDebounce } from "@/hooks/use-debounce"
import {
  CourseDirectoryOptions,
  CourseDetail,
  CoursePage,
  CourseSection,
  CourseSummary,
  getCourse,
  getCourseDirectoryOptions,
  getCourses,
  getInstructorRMPLinks,
  getRMPDepartments,
  getRMPProfessors,
  getSavedRMPDepartments,
  getSavedRMPProfessors,
  RegistrationSyncResult,
  InstructorRMPLink,
  RMPDepartment,
  RMPProfessor,
  RMPProfessorPage,
  RMPSyncResult,
  syncRMP,
  syncRegistrationJson,
  reviewInstructorRMPLink,
} from "@/lib/api"

type Route = "/" | "/rmp" | "/rmp-saved" | "/admin" | "/roadmap" | `/courses/${number}`

function App() {
  const [route, setRoute] = useState<Route>(getRoute())
  const [isDark, setIsDark] = useState(getInitialDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    localStorage.setItem("theme", isDark ? "dark" : "light")
  }, [isDark])

  useEffect(() => {
    const onPopState = () => setRoute(getRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function navigate(nextRoute: Route) {
    window.history.pushState({}, "", nextRoute)
    setRoute(nextRoute)
  }

  function openCourse(courseId: number, term: string) {
    const nextRoute = `/courses/${courseId}` as Route
    window.history.pushState({}, "", `${nextRoute}?term=${encodeURIComponent(term)}`)
    setRoute(nextRoute)
  }

  const tabRoute = route.startsWith("/courses/") ? "/" : route

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Course Directory</h1>
            <p className="text-sm text-muted-foreground">Marist sections, instructors, and RMP data.</p>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <Tabs value={tabRoute} onValueChange={(value) => navigate(value as Route)}>
              <TabsList>
                <TabsTrigger value="/">Courses</TabsTrigger>
                <TabsTrigger value="/rmp">Live RMP</TabsTrigger>
                <TabsTrigger value="/rmp-saved">Saved RMP</TabsTrigger>
                <TabsTrigger value="/roadmap">Roadmap</TabsTrigger>
                <TabsTrigger value="/admin">Admin</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => setIsDark((current) => !current)}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {route.startsWith("/courses/") ? (
          <CourseDetailPage courseId={Number(route.split("/").at(-1))} onBack={() => navigate("/")} />
        ) : route === "/admin" ? (
          <AdminPage />
        ) : route === "/roadmap" ? (
          <RoadmapPage />
        ) : route === "/rmp" ? (
          <RMPPage source="live" />
        ) : route === "/rmp-saved" ? (
          <RMPPage source="saved" />
        ) : (
          <CourseDirectoryPage onOpenCourse={openCourse} />
        )}
      </main>
    </div>
  )
}

function RMPPage({ source }: { source: "live" | "saved" }) {
  const isSaved = source === "saved"
  const [query, setQuery] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("")
  const [departments, setDepartments] = useState<RMPDepartment[]>([])
  const [page, setPage] = useState<RMPProfessorPage | null>(null)
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoadingDepartments(true)
    setError(null)

    const loadDepartments = isSaved ? getSavedRMPDepartments : getRMPDepartments
    loadDepartments(563, controller.signal)
      .then(setDepartments)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        setError(err instanceof Error ? err.message : "Unable to load RateMyProfessors departments.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingDepartments(false)
        }
      })

    return () => controller.abort()
  }, [isSaved])

  useEffect(() => {
    if (!selectedDepartment) {
      setPage(null)
      setIsLoadingResults(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingResults(true)
    setError(null)

    const request = isSaved
      ? getSavedRMPProfessors(
          {
            schoolId: 563,
            q: debouncedQuery.trim() || undefined,
            department: selectedDepartment,
            limit: 500,
          },
          controller.signal,
        )
      : getRMPProfessors(
          {
            schoolId: 563,
            q: debouncedQuery.trim() || undefined,
            department: selectedDepartment,
            pageSize: 100,
          },
          controller.signal,
        )

    request
      .then(setPage)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        setError(err instanceof Error ? err.message : "Unable to load RateMyProfessors data.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingResults(false)
        }
      })

    return () => controller.abort()
  }, [debouncedQuery, isSaved, selectedDepartment])

  const selectedDepartmentCount = departments.find((department) => department.name === selectedDepartment)?.count ?? 0
  const resultCount = page?.professors.length ?? 0

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal">{isSaved ? "Saved RateMyProfessors" : "Live RateMyProfessors"}</h2>
          <p className="text-sm text-muted-foreground">
            {isSaved ? "Browse the latest RMP snapshot stored in Postgres." : "Choose a department, then search the live Marist RMP results."}
          </p>
        </div>
        <Badge variant="muted" className="w-fit">
          {isLoadingDepartments ? "Loading departments" : `${departments.length} departments`}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Department search</CardTitle>
          <CardDescription>Results are sorted by rating, with unrated professors shown as N/A.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Could not load RMP data</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[280px_1fr]">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment} disabled={isLoadingDepartments}>
              <SelectTrigger aria-label="Select RMP department">
                <SelectValue placeholder="Select a department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((department) => (
                  <SelectItem key={department.name} value={department.name}>
                    {department.name} ({department.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search selected RMP department"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={selectedDepartment ? `Search ${selectedDepartment}` : "Select a department first"}
                disabled={!selectedDepartment}
              />
            </div>
          </div>

          {!selectedDepartment && !isLoadingDepartments ? (
            <div className="flex min-h-48 items-center justify-center rounded-md border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              {isSaved && departments.length === 0
                ? "No saved data yet. Run the RMP snapshot sync from the Admin page."
                : "Select a department to load its RateMyProfessors results."}
            </div>
          ) : null}

          {isLoadingDepartments ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {selectedDepartment ? (
            <div className="overflow-hidden rounded-md border">
              <RMPTable professors={page?.professors ?? []} isLoading={isLoadingResults} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedDepartment ? (
        <p className="text-sm text-muted-foreground">
          Showing {resultCount} of {selectedDepartmentCount} {selectedDepartment} professors.
        </p>
      ) : null}
    </section>
  )
}

function RMPTable({ professors, isLoading }: { professors: RMPProfessor[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (professors.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
        No RMP professors match the current query.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[190px]">Name</TableHead>
          <TableHead className="min-w-[180px]">Department</TableHead>
          <TableHead className="w-[120px]">Rating</TableHead>
          <TableHead className="w-[120px]">Difficulty</TableHead>
          <TableHead className="w-[120px]">Take Again</TableHead>
          <TableHead className="w-[110px]">Ratings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {professors.map((professor) => (
          <TableRow key={professor.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-1">
                <span>{professor.name}</span>
                <Button asChild variant="ghost" size="icon" className="size-7 shrink-0">
                  <a
                    href={professor.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${professor.name}'s RateMyProfessors profile in a new tab`}
                    title="Open RateMyProfessors profile"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{professor.department ?? "Unknown"}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Star className="size-4 fill-primary text-primary" />
                <span>{formatRating(professor)}</span>
              </div>
            </TableCell>
            <TableCell>{formatDifficulty(professor)}</TableCell>
            <TableCell>{formatTakeAgain(professor)}</TableCell>
            <TableCell>{professor.num_ratings ?? 0}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CourseDirectoryPage({ onOpenCourse }: { onOpenCourse: (courseId: number, term: string) => void }) {
  const pageSize = 100
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [subject, setSubject] = useState("all")
  const [offset, setOffset] = useState(0)
  const [options, setOptions] = useState<CourseDirectoryOptions>({ terms: [], subjects: [] })
  const [page, setPage] = useState<CoursePage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    const controller = new AbortController()
    getCourseDirectoryOptions(undefined, controller.signal)
      .then((result) => {
        setOptions(result)
        setTerm((current) => current || result.terms[0]?.code || "")
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Unable to load course filters.")
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!term) return
    const controller = new AbortController()
    getCourseDirectoryOptions(term, controller.signal)
      .then((result) => {
        setOptions(result)
        setSubject((current) => (current === "all" || result.subjects.includes(current) ? current : "all"))
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Unable to load course filters.")
        }
      })
    return () => controller.abort()
  }, [term])

  useEffect(() => {
    if (!term) {
      setPage(null)
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    getCourses(
      {
        q: debouncedQuery.trim() || undefined,
        term,
        subject,
        limit: pageSize,
        offset,
      },
      controller.signal,
    )
      .then(setPage)
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Unable to load courses.")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [debouncedQuery, offset, subject, term])

  const resultLabel = useMemo(() => {
    if (isLoading) return "Loading"
    const total = page?.total ?? 0
    return `${total} ${total === 1 ? "course" : "courses"}`
  }, [isLoading, page?.total])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal">Courses</h2>
          <p className="text-sm text-muted-foreground">Find a course, then compare its available sections and instructors.</p>
        </div>
        <Badge variant="muted" className="w-fit">{resultLabel}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search courses"
                className="pl-9"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setOffset(0)
                }}
                placeholder="Course, title, or instructor"
              />
            </div>
            <Select value={term} onValueChange={(value) => { setTerm(value); setOffset(0) }} disabled={options.terms.length === 0}>
              <SelectTrigger aria-label="Filter by term"><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent>
                {options.terms.map((option) => (
                  <SelectItem key={option.code} value={option.code}>{option.description} ({option.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subject} onValueChange={(value) => { setSubject(value); setOffset(0) }} disabled={!term}>
              <SelectTrigger aria-label="Filter by subject"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {options.subjects.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {error ? (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Could not load course directory</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <CourseTable courses={page?.courses ?? []} isLoading={isLoading} onOpenCourse={onOpenCourse} />
          )}
        </CardContent>
      </Card>

      {(page?.total ?? 0) > pageSize ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + pageSize, page?.total ?? 0)} of {page?.total ?? 0}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(0, offset - pageSize))} title="Previous page" aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon" disabled={offset + pageSize >= (page?.total ?? 0) || isLoading} onClick={() => setOffset(offset + pageSize)} title="Next page" aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function CourseTable({
  courses,
  isLoading,
  onOpenCourse,
}: {
  courses: CourseSummary[]
  isLoading: boolean
  onOpenCourse: (courseId: number, term: string) => void
}) {
  if (isLoading) {
    return <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
  }
  if (courses.length === 0) {
    return <div className="flex min-h-48 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">No courses match the current filters. Run a registration sync from Admin if the directory is empty.</div>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">Course</TableHead>
          <TableHead className="min-w-[280px]">Title</TableHead>
          <TableHead className="w-[120px]">Sections</TableHead>
          <TableHead className="w-[130px]">Instructors</TableHead>
          <TableHead className="w-[64px]"><span className="sr-only">Open</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.map((course) => (
          <TableRow key={course.id} className="cursor-pointer" onClick={() => onOpenCourse(course.id, course.term)}>
            <TableCell className="font-medium">{course.subject} {course.course_number}</TableCell>
            <TableCell>{course.title}</TableCell>
            <TableCell>{course.section_count}</TableCell>
            <TableCell>{course.instructor_count}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Open ${course.subject} ${course.course_number}`}
                title="Open course"
                onClick={(event) => { event.stopPropagation(); onOpenCourse(course.id, course.term) }}
              >
                <ChevronRight />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function CourseDetailPage({ courseId, onBack }: { courseId: number; onBack: () => void }) {
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const term = new URLSearchParams(window.location.search).get("term") ?? undefined

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    getCourse(courseId, term, controller.signal)
      .then(setCourse)
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Unable to load course details.")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [courseId, term])

  return (
    <section className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowLeft />Back to courses</Button>
      <div className="space-y-1">
        {isLoading ? <Skeleton className="h-8 w-72" /> : <h2 className="text-2xl font-semibold tracking-normal">{course?.subject} {course?.course_number}</h2>}
        <p className="text-muted-foreground">{course ? `${course.title} · ${course.term_description} (${course.term})` : "Course sections and instructors"}</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Available sections</CardTitle>
              <CardDescription>Compare instructors, enrollment, and open seats for this course.</CardDescription>
            </div>
            {course ? <Badge variant="muted">{course.sections.length} {course.sections.length === 1 ? "section" : "sections"}</Badge> : null}
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {error ? (
            <div className="p-4"><Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Could not load course</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>
          ) : <CourseSectionTable sections={course?.sections ?? []} isLoading={isLoading} />}
        </CardContent>
      </Card>
    </section>
  )
}

function CourseSectionTable({ sections, isLoading }: { sections: CourseSection[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
  }
  if (sections.length === 0) {
    return <div className="flex min-h-48 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">No course sections match the current filters. Run a registration sync from Admin if the directory is empty.</div>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[130px]">Course</TableHead>
          <TableHead className="w-[100px]">CRN</TableHead>
          <TableHead className="min-w-[240px]">Title</TableHead>
          <TableHead className="min-w-[220px]">Instructors</TableHead>
          <TableHead className="w-[110px]">Enrolled</TableHead>
          <TableHead className="w-[100px]">Seats</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sections.map((section) => (
          <TableRow key={section.id}>
            <TableCell className="font-medium">{section.subject} {section.course_number}</TableCell>
            <TableCell className="text-muted-foreground">{section.crn}</TableCell>
            <TableCell>{section.title}</TableCell>
            <TableCell>
              {section.instructors.length ? (
                <div className="space-y-1">
                  {section.instructors.map((instructor) => (
                    <div key={instructor.id} className="flex items-center gap-2">
                      <span>{instructor.display_name}</span>
                      {instructor.primary_indicator ? <Badge variant="outline">Primary</Badge> : null}
                      {instructor.rmp_profile_url ? (
                        <Button asChild variant="ghost" size="icon" className="size-7">
                          <a href={instructor.rmp_profile_url} target="_blank" rel="noopener noreferrer" title="Open RateMyProfessors profile" aria-label={`Open ${instructor.display_name}'s RateMyProfessors profile`}>
                            <ExternalLink />
                          </a>
                        </Button>
                      ) : null}
                      {instructor.rmp_num_ratings ? <Badge variant="muted">{instructor.rmp_overall_rating?.toFixed(1) ?? "N/A"}</Badge> : null}
                    </div>
                  ))}
                </div>
              ) : <span className="text-muted-foreground">TBA</span>}
            </TableCell>
            <TableCell>{section.enrollment ?? "N/A"}</TableCell>
            <TableCell>{section.seats_available ?? "N/A"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

type RoadmapPhase = "foundation" | "enrichment" | "requirements" | "experience"

type RoadmapTask = {
  id: string
  phase: RoadmapPhase
  title: string
  detail: string
  completed: boolean
  custom?: boolean
}

const ROADMAP_PHASES: Array<{ id: RoadmapPhase; title: string; description: string }> = [
  { id: "foundation", title: "Data foundation", description: "Reliable catalog, term, section, and professor data." },
  { id: "enrichment", title: "Section enrichment", description: "Safely evaluate and import richer per-CRN details." },
  { id: "requirements", title: "Program requirements", description: "Turn catalog requirements into reviewable structured data." },
  { id: "experience", title: "Planning experience", description: "Help students compare sections and understand degree progress." },
]

const DEFAULT_ROADMAP_TASKS: RoadmapTask[] = [
  { id: "registration-sync", phase: "foundation", title: "Registration catalog sync", detail: "Fetch every registration page and apply incremental section updates.", completed: true },
  { id: "course-identity", phase: "foundation", title: "Unique courses and term history", detail: "Keep catalog courses stable while sections remain term-specific.", completed: true },
  { id: "rmp-snapshots", phase: "foundation", title: "Saved RMP snapshots", detail: "Store ratings and preserve direct professor profile links.", completed: true },
  { id: "instructor-links", phase: "foundation", title: "Instructor identity links", detail: "Auto-approve unique matches and review ambiguous professor identities.", completed: true },
  { id: "crn-endpoint", phase: "enrichment", title: "Validate per-CRN endpoint", detail: "Run a five-CRN authenticated sample and inspect status, latency, and response shape.", completed: false },
  { id: "crn-schema", phase: "enrichment", title: "Define section-detail schema", detail: "Identify useful meeting, location, restriction, and prerequisite fields.", completed: false },
  { id: "crn-incremental", phase: "enrichment", title: "Incremental CRN detail sync", detail: "Hash responses and refresh only stale or changed section details.", completed: false },
  { id: "pdf-probe", phase: "requirements", title: "PDF extraction probe", detail: "Preserve page text and detect program/course occurrences with provenance.", completed: true },
  { id: "requirements-review", phase: "requirements", title: "Review requirement parsing", detail: "Handle electives, either/or choices, minimum selections, and shared requirements.", completed: false },
  { id: "requirements-db", phase: "requirements", title: "Import catalog requirements", detail: "Add versioned programs, requirement groups, and course associations.", completed: false },
  { id: "professor-compare", phase: "experience", title: "Compare course sections", detail: "Compare every professor, rating, availability, and schedule for one course.", completed: false },
  { id: "professor-rmp-metrics", phase: "experience", title: "Show RMP metrics in Courses", detail: "Expose the stored Would Take Again percentage and Level of Difficulty alongside overall rating on course section and professor comparison views, with N/A for missing data.", completed: false },
  { id: "degree-progress", phase: "experience", title: "Degree progress workspace", detail: "Let students explore remaining requirements without claiming official advising status.", completed: false },
]

function RoadmapPage() {
  const [tasks, setTasks] = useState<RoadmapTask[]>(loadRoadmapTasks)
  const [newTask, setNewTask] = useState("")
  const [newTaskPhase, setNewTaskPhase] = useState<RoadmapPhase>("enrichment")

  useEffect(() => {
    localStorage.setItem("project-roadmap", JSON.stringify(tasks))
  }, [tasks])

  const completedCount = tasks.filter((task) => task.completed).length
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0

  function toggleTask(taskId: string) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task))
  }

  function addTask() {
    const title = newTask.trim()
    if (!title) return
    setTasks((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        phase: newTaskPhase,
        title,
        detail: "Custom roadmap task.",
        completed: false,
        custom: true,
      },
    ])
    setNewTask("")
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-normal">Project roadmap</h2>
          <p className="text-sm text-muted-foreground">Track the path from synchronized catalog data to a useful course-planning experience.</p>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{completedCount} of {tasks.length} complete</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Roadmap progress">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ROADMAP_PHASES.map((phase, phaseIndex) => {
          const phaseTasks = tasks.filter((task) => task.phase === phase.id)
          const phaseComplete = phaseTasks.filter((task) => task.completed).length
          return (
            <Card key={phase.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardDescription>Phase {phaseIndex + 1}</CardDescription>
                    <CardTitle>{phase.title}</CardTitle>
                    <CardDescription className="mt-1">{phase.description}</CardDescription>
                  </div>
                  <Badge
                    variant="muted"
                    className={phaseComplete === phaseTasks.length && phaseTasks.length ? "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : undefined}
                  >
                    {phaseComplete}/{phaseTasks.length}
                  </Badge>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="divide-y p-0">
                {phaseTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-5 py-4">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                      aria-label={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={task.completed ? "font-medium text-muted-foreground line-through" : "font-medium"}>{task.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{task.detail}</p>
                    </div>
                    {task.custom ? (
                      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} title="Delete task" aria-label={`Delete ${task.title}`}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary"><ClipboardList className="size-4" /></div>
            <div><CardTitle>Add roadmap task</CardTitle><CardDescription>Custom tasks are stored in this browser.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
            <Input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addTask() }} placeholder="Task name" aria-label="New roadmap task" />
            <Select value={newTaskPhase} onValueChange={(value) => setNewTaskPhase(value as RoadmapPhase)}>
              <SelectTrigger aria-label="Roadmap phase"><SelectValue /></SelectTrigger>
              <SelectContent>{ROADMAP_PHASES.map((phase) => <SelectItem key={phase.id} value={phase.id}>{phase.title}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={addTask} disabled={!newTask.trim()}><Plus />Add</Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function loadRoadmapTasks(): RoadmapTask[] {
  try {
    const saved = JSON.parse(localStorage.getItem("project-roadmap") ?? "[]") as RoadmapTask[]
    const savedById = new Map(saved.map((task) => [task.id, task]))
    return [
      ...DEFAULT_ROADMAP_TASKS.map((task) => ({ ...task, completed: savedById.get(task.id)?.completed ?? task.completed })),
      ...saved.filter((task) => task.custom && !DEFAULT_ROADMAP_TASKS.some((defaultTask) => defaultTask.id === task.id)),
    ]
  } catch {
    return DEFAULT_ROADMAP_TASKS
  }
}

function AdminPage() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("admin-token") ?? "")
  const [isSyncingRMP, setIsSyncingRMP] = useState(false)
  const [rmpResult, setRmpResult] = useState<RMPSyncResult | null>(null)
  const [rmpError, setRmpError] = useState<string | null>(null)
  const [isSyncingRegistration, setIsSyncingRegistration] = useState(false)
  const [registrationResult, setRegistrationResult] = useState<RegistrationSyncResult | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [pendingLinks, setPendingLinks] = useState<InstructorRMPLink[]>([])
  const [isLoadingLinks, setIsLoadingLinks] = useState(false)
  const [hasLoadedLinks, setHasLoadedLinks] = useState(false)
  const [reviewingInstructorId, setReviewingInstructorId] = useState<number | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  async function onRMPSync() {
    setIsSyncingRMP(true)
    setRmpError(null)
    setRmpResult(null)
    sessionStorage.setItem("admin-token", adminToken)

    try {
      setRmpResult(await syncRMP(adminToken))
    } catch (err) {
      setRmpError(err instanceof Error ? err.message : "RMP sync failed.")
    } finally {
      setIsSyncingRMP(false)
    }
  }

  async function onRegistrationSync() {
    setIsSyncingRegistration(true)
    setRegistrationError(null)
    setRegistrationResult(null)
    sessionStorage.setItem("admin-token", adminToken)

    try {
      setRegistrationResult(await syncRegistrationJson(adminToken))
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "Registration JSON sync failed.")
    } finally {
      setIsSyncingRegistration(false)
    }
  }

  async function loadPendingLinks() {
    setIsLoadingLinks(true)
    setHasLoadedLinks(false)
    setLinkError(null)
    sessionStorage.setItem("admin-token", adminToken)
    try {
      setPendingLinks(await getInstructorRMPLinks(adminToken))
      setHasLoadedLinks(true)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not load pending professor links.")
    } finally {
      setIsLoadingLinks(false)
    }
  }

  async function reviewLink(link: InstructorRMPLink, matchStatus: "approved" | "rejected") {
    setReviewingInstructorId(link.instructor_id)
    setLinkError(null)
    try {
      await reviewInstructorRMPLink(
        adminToken,
        link.instructor_id,
        link.rmp_professor_id,
        matchStatus,
      )
      setPendingLinks((current) => current.filter((item) => item.instructor_id !== link.instructor_id))
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not review professor link.")
    } finally {
      setReviewingInstructorId(null)
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-normal">Admin Sync</h2>
        <p className="text-sm text-muted-foreground">Refresh registration and RateMyProfessors data.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <CardTitle>Data refresh</CardTitle>
              <CardDescription>Enter the local admin token, then choose the data source to synchronize.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              aria-label="Admin token"
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Admin token"
              autoComplete="off"
            />
            <Button type="button" variant="outline" disabled={isSyncingRMP || adminToken.trim().length === 0} onClick={onRMPSync}>
              {isSyncingRMP ? <RefreshCw className="animate-spin" /> : <DatabaseZap />}
              {isSyncingRMP ? "Saving RMP snapshot" : "Sync RMP snapshot"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSyncingRegistration || adminToken.trim().length === 0}
              onClick={onRegistrationSync}
            >
              {isSyncingRegistration ? <RefreshCw className="animate-spin" /> : <FileJson />}
              {isSyncingRegistration ? "Fetching and syncing registration" : "Fetch and sync registration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Professor link review</CardTitle>
              <CardDescription>Unique exact-name matches are approved automatically. Review only conflicts and duplicates here.</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadPendingLinks}
              disabled={isLoadingLinks || adminToken.trim().length === 0}
            >
              {isLoadingLinks ? <RefreshCw className="animate-spin" /> : <Link2 />}
              {isLoadingLinks ? "Loading" : "Load pending"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Professor link review failed</AlertTitle>
              <AlertDescription>{linkError}</AlertDescription>
            </Alert>
          ) : null}

          {pendingLinks.length ? (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Registration instructor</TableHead>
                    <TableHead>RMP profile</TableHead>
                    <TableHead className="w-[110px]">Confidence</TableHead>
                    <TableHead className="w-[104px]"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLinks.map((link) => {
                    const isReviewing = reviewingInstructorId === link.instructor_id
                    return (
                      <TableRow key={link.instructor_id}>
                        <TableCell>
                          <div className="font-medium">{link.instructor_name}</div>
                          {link.instructor_email ? <div className="text-xs text-muted-foreground">{link.instructor_email}</div> : null}
                        </TableCell>
                        <TableCell>
                          <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={link.rmp_profile_url} target="_blank" rel="noopener noreferrer">
                            {link.rmp_name}<ExternalLink className="size-3.5" />
                          </a>
                        </TableCell>
                        <TableCell>{link.match_confidence === null ? "N/A" : `${Math.round(link.match_confidence * 100)}%`}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" disabled={isReviewing} onClick={() => reviewLink(link, "approved")} title="Approve link" aria-label={`Approve ${link.instructor_name} link`}><Check /></Button>
                            <Button size="icon" variant="outline" disabled={isReviewing} onClick={() => reviewLink(link, "rejected")} title="Reject link" aria-label={`Reject ${link.instructor_name} link`}><X /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : hasLoadedLinks && !isLoadingLinks ? (
            <Alert variant="success">
              <Check className="size-4" />
              <AlertTitle>No pending requests</AlertTitle>
              <AlertDescription>All unambiguous professor links are already approved.</AlertDescription>
            </Alert>
          ) : !isLoadingLinks ? (
            <p className="text-sm text-muted-foreground">Load the pending queue to review suggested matches.</p>
          ) : null}
        </CardContent>
      </Card>

      {rmpError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>RMP sync failed</AlertTitle>
          <AlertDescription>{rmpError}</AlertDescription>
        </Alert>
      ) : null}

      {rmpResult ? (
        <Alert variant="success">
          <AlertTitle>RMP snapshot saved</AlertTitle>
          <AlertDescription>
            <div className="grid gap-2 pt-1 sm:grid-cols-5">
              <SyncMetric label="Fetched" value={rmpResult.fetched} />
              <SyncMetric label="Inserted" value={rmpResult.inserted} />
              <SyncMetric label="Updated" value={rmpResult.updated} />
              <SyncMetric label="Unchanged" value={rmpResult.unchanged} />
              <SyncMetric label="Deleted" value={rmpResult.deleted} />
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {registrationError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Registration sync failed</AlertTitle>
          <AlertDescription>{registrationError}</AlertDescription>
        </Alert>
      ) : null}

      {registrationResult ? (
        <Alert variant="success">
          <AlertTitle>Registration JSON synced for {registrationResult.term_description} ({registrationResult.term})</AlertTitle>
          <AlertDescription>
            <div className="grid gap-2 pt-1 sm:grid-cols-5">
              <SyncMetric label="Fetched" value={registrationResult.fetched} />
              <SyncMetric label="Inserted" value={registrationResult.sections_inserted} />
              <SyncMetric label="Updated" value={registrationResult.sections_updated} />
              <SyncMetric label="Unchanged" value={registrationResult.sections_unchanged} />
              <SyncMetric label="Inactive" value={registrationResult.sections_deactivated} />
            </div>
            <p className="pt-3 text-xs text-emerald-800">
              Courses: +{registrationResult.courses_inserted} / {registrationResult.courses_updated} updated. Instructors: +
              {registrationResult.instructors_inserted} / {registrationResult.instructors_updated} updated. Teaching links: +
              {registrationResult.links_inserted} / {registrationResult.links_updated} updated / {registrationResult.links_deleted} removed.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}

function SyncMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-white/70 p-3">
      <div className="text-xs font-medium uppercase text-emerald-700">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-emerald-950">{value}</div>
    </div>
  )
}

function getRoute(): Route {
  if (/^\/courses\/\d+$/.test(window.location.pathname)) {
    return window.location.pathname as Route
  }

  if (window.location.pathname === "/admin") {
    return "/admin"
  }

  if (window.location.pathname === "/roadmap") {
    return "/roadmap"
  }

  if (window.location.pathname === "/rmp") {
    return "/rmp"
  }

  if (window.location.pathname === "/rmp-saved") {
    return "/rmp-saved"
  }

  return "/"
}

function getInitialDarkMode(): boolean {
  const savedTheme = localStorage.getItem("theme")
  if (savedTheme === "dark") return true
  if (savedTheme === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function hasRatings(professor: RMPProfessor): boolean {
  return (professor.num_ratings ?? 0) > 0
}

function getSortableRating(professor: RMPProfessor): number {
  if (!hasRatings(professor) || professor.overall_rating === null) {
    return -1
  }

  return professor.overall_rating
}

function formatRating(professor: RMPProfessor): string {
  if (!hasRatings(professor) || professor.overall_rating === null || professor.overall_rating === 0) {
    return "N/A"
  }

  return professor.overall_rating.toFixed(1)
}

function formatDifficulty(professor: RMPProfessor): string {
  if (!hasRatings(professor) || professor.level_of_difficulty === null || professor.level_of_difficulty === 0) {
    return "N/A"
  }

  return professor.level_of_difficulty.toFixed(1)
}

function formatTakeAgain(professor: RMPProfessor): string {
  if (!hasRatings(professor) || professor.percent_take_again === null || professor.percent_take_again <= 0) {
    return "N/A"
  }

  return `${Math.round(professor.percent_take_again)}%`
}

export default App
