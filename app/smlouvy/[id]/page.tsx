import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ExternalLink, ArrowLeft, AlertTriangle, Clock, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { fetchSmlouvaById, refreshSmlouva } from "@/app/actions/smlouvy"

// Generate metadata for the page
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { data: contract } = await fetchSmlouvaById(params.id)

  if (!contract) {
    return {
      title: "Smlouva nenalezena | MůjDaňovýHlídač",
    }
  }

  return {
    title: `${contract.nazev} | MůjDaňovýHlídač`,
    description: `Detail smlouvy: ${contract.nazev} - ${contract.dodavatel.nazev} a ${contract.zadavatel.nazev}`,
  }
}

export default async function SmlouvaDetailPage({ params }: { params: { id: string } }) {
  // Fetch contract details
  const { data: contract, success, error, cached } = await fetchSmlouvaById(params.id)

  // If contract not found, show 404 page
  if (!success && !contract) {
    notFound()
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

  // Handle refresh button click
  async function handleRefresh() {
    "use server"
    await refreshSmlouva(params.id, `/smlouvy/${params.id}`)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/smlouvy" className="flex items-center">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zpět na seznam smluv
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chyba</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {contract && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">{contract.nazev}</h1>

            {cached && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>Načteno z cache</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Data jsou načtena z mezipaměti pro rychlejší odezvu.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {formatAmount(contract.castka)}
            </Badge>
            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
              {formatDate(contract.datumUzavreni)}
            </Badge>

            <form action={handleRefresh} className="ml-auto">
              <Button type="submit" variant="outline" size="sm" className="flex items-center">
                <RefreshCw className="h-4 w-4 mr-2" />
                Obnovit data
              </Button>
            </form>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dodavatel</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium">{contract.dodavatel.nazev}</p>
                <p className="text-muted-foreground">IČO: {contract.dodavatel.ico}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zadavatel</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium">{contract.zadavatel.nazev}</p>
                <p className="text-muted-foreground">IČO: {contract.zadavatel.ico}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Předmět smlouvy</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{contract.predmet}</p>
            </CardContent>
            <CardFooter>
              <Button asChild>
                <a href={contract.odkaz} target="_blank" rel="noopener noreferrer" className="flex items-center">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Zobrazit v Registru smluv
                </a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </main>
  )
}

