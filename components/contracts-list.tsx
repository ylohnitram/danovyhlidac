"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { fetchSmlouvy, refreshSmlouvy, type FetchSmlouvyParams, type Smlouva } from "@/app/actions/smlouvy"

// Categories for filtering
const CATEGORIES = [
  { id: "", name: "Všechny kategorie" },
  { id: "verejne-zakazky", name: "Veřejné zakázky" },
  { id: "dotace", name: "Dotace a granty" },
  { id: "prodej-majetku", name: "Prodej majetku" },
  { id: "najem", name: "Nájem" },
  { id: "ostatni", name: "Ostatní" },
]

export default function ContractsList() {
  // Get search params and router
  const searchParams = useSearchParams()
  const router = useRouter()

  // Parse search params
  const query = searchParams.get("q") || ""
  const category = searchParams.get("kategorie") || ""
  const page = Number.parseInt(searchParams.get("page") || "1")

  // State for contracts data
  const [contracts, setContracts] = useState<Smlouva[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  })

  // State for search form
  const [searchQuery, setSearchQuery] = useState(query)
  const [selectedCategory, setSelectedCategory] = useState(category)
  const [refreshing, setRefreshing] = useState(false)

  // State for cache info
  const [isCached, setIsCached] = useState(false)

  // Load contracts on mount and when search params change
  useEffect(() => {
    const loadContracts = async () => {
      setLoading(true)
      setError(null)

      try {
        // Prepare params for the server action
        const params: FetchSmlouvyParams = {
          query: query || undefined,
          kategorie: category || undefined,
          page,
          limit: 10,
        }

        // Call the server action
        const result = await fetchSmlouvy(params)

        if (result.success) {
          setContracts(result.data)
          setPagination({
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          })
          setIsCached(result.cached || false)
        } else {
          setError(result.error || "Došlo k chybě při načítání dat.")
          setContracts([])
        }
      } catch (err) {
        console.error("Error loading contracts:", err)
        setError("Došlo k neočekávané chybě při načítání dat.")
        setContracts([])
      } finally {
        setLoading(false)
      }
    }

    loadContracts()
  }, [query, category, page])

  // Handle search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()

    // Update URL with search params
    const params = new URLSearchParams()
    if (searchQuery) params.set("q", searchQuery)
    if (selectedCategory) params.set("kategorie", selectedCategory)
    params.set("page", "1") // Reset to first page on new search

    router.push(`/smlouvy?${params.toString()}`)
  }

  // Handle refresh button click
  const handleRefresh = async () => {
    setRefreshing(true)

    try {
      await refreshSmlouvy("/smlouvy")

      // Reload the current page with skipCache=true
      const params: FetchSmlouvyParams = {
        query: query || undefined,
        kategorie: category || undefined,
        page,
        limit: 10,
        skipCache: true,
      }

      const result = await fetchSmlouvy(params)

      if (result.success) {
        setContracts(result.data)
        setPagination({
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        })
        setIsCached(false)
      } else {
        setError(result.error || "Došlo k chybě při obnovování dat.")
      }
    } catch (err) {
      console.error("Error refreshing contracts:", err)
      setError("Došlo k neočekávané chybě při obnovování dat.")
    } finally {
      setRefreshing(false)
    }
  }

  // Format date to Czech format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)
  }

  // Format amount with Czech formatting
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Generate pagination items
  const generatePaginationItems = () => {
    const items = []
    const maxVisiblePages = 5

    // Always show first page
    items.push(
      <PaginationItem key="first">
        <PaginationLink
          href={`/smlouvy?${new URLSearchParams({
            ...(query ? { q: query } : {}),
            ...(category ? { kategorie: category } : {}),
            page: "1",
          })}`}
          isActive={pagination.page === 1}
        >
          1
        </PaginationLink>
      </PaginationItem>,
    )

    // Calculate range of pages to show
    const startPage = Math.max(2, pagination.page - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(pagination.totalPages - 1, startPage + maxVisiblePages - 3)

    // Adjust if we're near the beginning
    if (startPage > 2) {
      items.push(<PaginationEllipsis key="ellipsis-start" />)
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            href={`/smlouvy?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(category ? { kategorie: category } : {}),
              page: i.toString(),
            })}`}
            isActive={pagination.page === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>,
      )
    }

    // Add ellipsis if needed
    if (endPage < pagination.totalPages - 1) {
      items.push(<PaginationEllipsis key="ellipsis-end" />)
    }

    // Always show last page if there is more than one page
    if (pagination.totalPages > 1) {
      items.push(
        <PaginationItem key="last">
          <PaginationLink
            href={`/smlouvy?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              ...(category ? { kategorie: category } : {}),
              page: pagination.totalPages.toString(),
            })}`}
            isActive={pagination.page === pagination.totalPages}
          >
            {pagination.totalPages}
          </PaginationLink>
        </PaginationItem>,
      )
    }

    return items
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vyhledávání smluv</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Input
                  placeholder="Hledat podle názvu, dodavatele nebo zadavatele..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vyberte kategorii" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit">Vyhledat</Button>
            <Button type="button" variant="outline" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Obnovit
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chyba</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {pagination.total > 0 ? (
            <>
              Nalezeno {pagination.total} smluv
              {query && (
                <>
                  , hledáno: <strong>{query}</strong>
                </>
              )}
              {category && (
                <>
                  , kategorie: <strong>{CATEGORIES.find((c) => c.id === category)?.name || category}</strong>
                </>
              )}
            </>
          ) : (
            <>
              Nebyly nalezeny žádné smlouvy
              {query && (
                <>
                  , hledáno: <strong>{query}</strong>
                </>
              )}
              {category && (
                <>
                  , kategorie: <strong>{CATEGORIES.find((c) => c.id === category)?.name || category}</strong>
                </>
              )}
            </>
          )}
        </div>

        {isCached && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>Načteno z cache</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Data jsou načtena z mezipaměti pro rychlejší odezvu. Klikněte na tlačítko Obnovit pro aktuální data.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {contracts.length > 0 ? (
            <div className="space-y-4">
              {contracts.map((contract) => (
                <Card key={contract.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{contract.nazev}</CardTitle>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {formatAmount(contract.castka)}
                      </Badge>
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                        {formatDate(contract.datumUzavreni)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Dodavatel:</p>
                        <p>{contract.dodavatel.nazev}</p>
                        <p className="text-sm text-muted-foreground">IČO: {contract.dodavatel.ico}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Zadavatel:</p>
                        <p>{contract.zadavatel.nazev}</p>
                        <p className="text-sm text-muted-foreground">IČO: {contract.zadavatel.ico}</p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button variant="outline" size="sm" asChild>
                      <a href={contract.odkaz} target="_blank" rel="noopener noreferrer" className="flex items-center">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Zobrazit v Registru smluv
                      </a>
                    </Button>
                  </CardFooter>
                </Card>
              ))}

              {pagination.totalPages > 1 && (
                <Pagination>
                  <PaginationContent>
                    <PaginationPrevious
                      href={
                        pagination.page > 1
                          ? `/smlouvy?${new URLSearchParams({
                              ...(query ? { q: query } : {}),
                              ...(category ? { kategorie: category } : {}),
                              page: (pagination.page - 1).toString(),
                            })}`
                          : undefined
                      }
                      aria-disabled={pagination.page <= 1}
                    />

                    {generatePaginationItems()}

                    <PaginationNext
                      href={
                        pagination.page < pagination.totalPages
                          ? `/smlouvy?${new URLSearchParams({
                              ...(query ? { q: query } : {}),
                              ...(category ? { kategorie: category } : {}),
                              page: (pagination.page + 1).toString(),
                            })}`
                          : undefined
                      }
                      aria-disabled={pagination.page >= pagination.totalPages}
                    />
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">
                  Nebyly nalezeny žádné smlouvy odpovídající zadaným kritériím.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory("")
                    router.push("/smlouvy")
                  }}
                >
                  Zrušit filtry
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

