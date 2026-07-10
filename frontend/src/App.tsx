import { AlertCircle, ChevronLeft, ChevronRight, DatabaseZap, ExternalLink, FileJson, RefreshCw, Search, ShieldCheck, Star } from "lucide-react"
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
  CourseSection,
  CourseSectionPage,
  getCourseDirectoryOptions,
  getCourseSections,
  getRMPDepartments,
  getRMPProfessors,
  getSavedRMPDepartments,
  getSavedRMPProfessors,
  RegistrationSyncResult,
  RMPDepartment,
  RMPProfessor,
  RMPProfessorPage,
  RMPSyncResult,
  syncRMP,
  syncRegistrationJson,
} from "@/lib/api"

type Route = "/" | "/rmp" | "/rmp-saved" | "/admin"

function App() {
  const [route, setRoute] = useState<Route>(getRoute())

  useEffect(() => {
    const onPopState = () => setRoute(getRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function navigate(nextRoute: Route) {
    window.history.pushState({}, "", nextRoute)
    setRoute(nextRoute)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Course Directory</h1>
            <p className="text-sm text-muted-foreground">Marist sections, instructors, and RMP data.</p>
          </div>
          <Tabs value={route} onValueChange={(value) => navigate(value as Route)}>
            <TabsList>
              <TabsTrigger value="/">Courses</TabsTrigger>
              <TabsTrigger value="/rmp">Live RMP</TabsTrigger>
              <TabsTrigger value="/rmp-saved">Saved RMP</TabsTrigger>
              <TabsTrigger value="/admin">Admin</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {route === "/admin" ? (
          <AdminPage />
        ) : route === "/rmp" ? (
          <RMPPage source="live" />
        ) : route === "/rmp-saved" ? (
          <RMPPage source="saved" />
        ) : (
          <CourseDirectoryPage />
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

function CourseDirectoryPage() {
  const pageSize = 100
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [subject, setSubject] = useState("all")
  const [offset, setOffset] = useState(0)
  const [options, setOptions] = useState<CourseDirectoryOptions>({ terms: [], subjects: [] })
  const [page, setPage] = useState<CourseSectionPage | null>(null)
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
    getCourseSections(
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
          setError(err instanceof Error ? err.message : "Unable to load course sections.")
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
    return `${total} ${total === 1 ? "section" : "sections"}`
  }, [isLoading, page?.total])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal">Course Sections</h2>
          <p className="text-sm text-muted-foreground">Search courses, CRNs, titles, or instructors.</p>
        </div>
        <Badge variant="muted" className="w-fit">{resultLabel}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search course sections"
                className="pl-9"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setOffset(0)
                }}
                placeholder="Course, CRN, title, or instructor"
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
            <CourseSectionTable sections={page?.sections ?? []} isLoading={isLoading} />
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

function AdminPage() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("admin-token") ?? "")
  const [isSyncingRMP, setIsSyncingRMP] = useState(false)
  const [rmpResult, setRmpResult] = useState<RMPSyncResult | null>(null)
  const [rmpError, setRmpError] = useState<string | null>(null)
  const [isSyncingRegistration, setIsSyncingRegistration] = useState(false)
  const [registrationResult, setRegistrationResult] = useState<RegistrationSyncResult | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)

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
  if (window.location.pathname === "/admin") {
    return "/admin"
  }

  if (window.location.pathname === "/rmp") {
    return "/rmp"
  }

  if (window.location.pathname === "/rmp-saved") {
    return "/rmp-saved"
  }

  return "/"
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
