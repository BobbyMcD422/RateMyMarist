import { AlertCircle, DatabaseZap, RefreshCw, Search, ShieldCheck, Star } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

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
  getProfessors,
  getRMPDepartments,
  getRMPProfessors,
  Professor,
  RMPDepartment,
  RMPProfessor,
  RMPProfessorPage,
  syncCatalog,
  SyncResult,
} from "@/lib/api"

type Route = "/" | "/rmp" | "/admin"

const categoryOptions = [
  { label: "All", value: "all" },
  { label: "Faculty", value: "Faculty" },
  { label: "Emeriti Faculty", value: "Emeriti Faculty" },
]

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
            <h1 className="text-xl font-semibold tracking-normal">Professor Catalog</h1>
            <p className="text-sm text-muted-foreground">Marist faculty data with RMP scores coming soon.</p>
          </div>
          <Tabs value={route} onValueChange={(value) => navigate(value as Route)}>
            <TabsList>
              <TabsTrigger value="/">Directory</TabsTrigger>
              <TabsTrigger value="/rmp">RMP</TabsTrigger>
              <TabsTrigger value="/admin">Admin</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {route === "/admin" ? <AdminPage /> : route === "/rmp" ? <RMPPage /> : <DirectoryPage />}
      </main>
    </div>
  )
}

function RMPPage() {
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

    getRMPDepartments(563, controller.signal)
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
  }, [])

  useEffect(() => {
    if (!selectedDepartment) {
      setPage(null)
      setIsLoadingResults(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingResults(true)
    setError(null)

    getRMPProfessors(
      {
        schoolId: 563,
        q: debouncedQuery.trim() || undefined,
        department: selectedDepartment,
        pageSize: 100,
      },
      controller.signal,
    )
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
  }, [debouncedQuery, selectedDepartment])

  const selectedDepartmentCount = departments.find((department) => department.name === selectedDepartment)?.count ?? 0
  const resultCount = page?.professors.length ?? 0

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal">RateMyProfessors</h2>
          <p className="text-sm text-muted-foreground">Choose a department, then search those Marist RMP results.</p>
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
              Select a department to load its RateMyProfessors results.
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
            <TableCell className="font-medium">{professor.name}</TableCell>
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

function DirectoryPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [professors, setProfessors] = useState<Professor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    getProfessors(
      {
        q: debouncedQuery.trim() || undefined,
        category,
        limit: 100,
        offset: 0,
      },
      controller.signal,
    )
      .then(setProfessors)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        setError(err instanceof Error ? err.message : "Unable to load professors.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [category, debouncedQuery])

  const resultLabel = useMemo(() => {
    if (isLoading) {
      return "Loading"
    }

    return `${professors.length} ${professors.length === 1 ? "professor" : "professors"}`
  }, [isLoading, professors.length])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal">Directory</h2>
          <p className="text-sm text-muted-foreground">Search by professor name or title.</p>
        </div>
        <Badge variant="muted" className="w-fit">
          {resultLabel}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search professors"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names or titles"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
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
                <AlertTitle>Could not load directory</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <ProfessorTable professors={professors} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function ProfessorTable({ professors, isLoading }: { professors: Professor[]; isLoading: boolean }) {
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
        No professors match the current filters.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[190px]">Name</TableHead>
          <TableHead className="min-w-[280px]">Title</TableHead>
          <TableHead className="w-[150px]">Category</TableHead>
          <TableHead className="w-[120px]">RMP Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {professors.map((professor) => (
          <TableRow key={professor.id}>
            <TableCell className="font-medium">{professor.name}</TableCell>
            <TableCell className="text-muted-foreground">{professor.title ?? "Unknown"}</TableCell>
            <TableCell>
              <Badge variant={professor.category === "Emeriti Faculty" ? "outline" : "secondary"}>{professor.category}</Badge>
            </TableCell>
            <TableCell>
              {professor.rmp_score ? (
                <Badge>{professor.rmp_score}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Not added</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function AdminPage() {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem("admin-token") ?? "")
  const [isSyncing, setIsSyncing] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSyncing(true)
    setError(null)
    setResult(null)
    sessionStorage.setItem("admin-token", adminToken)

    try {
      const syncResult = await syncCatalog(adminToken)
      setResult(syncResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-normal">Admin Sync</h2>
        <p className="text-sm text-muted-foreground">Refresh the local database from the Marist catalog.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <CardTitle>Catalog refresh</CardTitle>
              <CardDescription>Enter the local admin token and run a sync when catalog data changes.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Input
              aria-label="Admin token"
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Admin token"
              autoComplete="off"
            />
            <Button type="submit" disabled={isSyncing || adminToken.trim().length === 0}>
              {isSyncing ? <RefreshCw className="animate-spin" /> : <DatabaseZap />}
              {isSyncing ? "Syncing" : "Sync catalog"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Alert variant="success">
          <AlertTitle>Sync complete</AlertTitle>
          <AlertDescription>
            <div className="grid gap-2 pt-1 sm:grid-cols-4">
              <SyncMetric label="Fetched" value={result.fetched} />
              <SyncMetric label="Inserted" value={result.inserted} />
              <SyncMetric label="Updated" value={result.updated} />
              <SyncMetric label="Skipped" value={result.skipped} />
            </div>
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
  if (!hasRatings(professor) || professor.percent_take_again === null || professor.percent_take_again === 0) {
    return "N/A"
  }

  return `${Math.round(professor.percent_take_again)}%`
}

export default App
