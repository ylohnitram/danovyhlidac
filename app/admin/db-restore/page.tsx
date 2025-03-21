'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, Database, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react"

export default function DatabaseRestorePage() {
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<any[]>([])
  const [tableCounts, setTableCounts] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [restoringData, setRestoringData] = useState(false)
  const [restoreResult, setRestoreResult] = useState<any>(null)

  // Load database information
  const fetchDatabaseInfo = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-recovery')
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const data = await response.json()
      console.log("API response:", data)
      
      setTables(data.tables || [])
      setTableCounts(data.tableCounts || [])
    } catch (err) {
      console.error("Error fetching database info:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    fetchDatabaseInfo()
  }, [])

  // Start restore process
  const handleRestore = async () => {
    setRestoringData(true)
    setRestoreResult(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-recovery', {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Restore result:", result)
      setRestoreResult(result)

      // Reload table info after restoration
      fetchDatabaseInfo()
    } catch (err) {
      console.error("Error restoring data:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoringData(false)
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Obnova dat databáze</h1>
        <p className="text-muted-foreground">
          Tato stránka vám umožňuje obnovit data z původních tabulek (s odlišnými názvy) do nových tabulek s konzistentními názvy.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Chyba</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {restoreResult && restoreResult.success && (
          <Alert variant="default" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle>Operace dokončena</AlertTitle>
            <AlertDescription>
              <p>Proces obnovy dat byl dokončen. 
                {restoreResult.results && restoreResult.results.length > 0 
                  ? ` Zpracováno ${restoreResult.results.length} tabulek.` 
                  : ''}
              </p>
              
              {restoreResult.results && restoreResult.results.length > 0 && (
                <div className="space-y-1 mt-2 text-sm">
                  {restoreResult.results.map((result: any, index: number) => (
                    <div key={index}>
                      {result.result?.success 
                        ? <span className="text-green-700">✓ {result.source} → {result.target}: {result.result.message}</span>
                        : <span className="text-red-700">✗ {result.source} → {result.target}: {result.result?.message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Seznam tabulek v databázi</CardTitle>
            <CardDescription>
              Přehled všech tabulek a počtu záznamů v nich
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Název tabulky</TableHead>
                    <TableHead>Vlastník</TableHead>
                    <TableHead className="text-right">Počet záznamů</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.length > 0 ? (
                    tables.map((table, index) => {
                      const countInfo = tableCounts.find(t => t.name === table.tablename)
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{table.tablename}</TableCell>
                          <TableCell>{table.tableowner}</TableCell>
                          <TableCell className="text-right">
                            {countInfo ? (
                              <Badge variant={countInfo.count && Number(countInfo.count) > 0 ? "default" : "outline"}>
                                {countInfo.count}
                              </Badge>
                            ) : "N/A"}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4">
                        Nebyly nalezeny žádné tabulky
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={fetchDatabaseInfo} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Obnovit
            </Button>
            <Button 
              onClick={handleRestore} 
              disabled={loading || restoringData || tables.length === 0}
            >
              {restoringData ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Obnovování...
                </>
              ) : (
                "Přenést data z původních tabulek"
              )}
            </Button>
          </CardFooter>
        </Card>

        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Důležité upozornění</AlertTitle>
          <AlertDescription>
            <p className="mb-2">Proces obnovy dat:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Vyhledává tabulky s různými variantami názvů (např. "Smlouva" a "smlouva")</li>
              <li>Kopíruje data z původních tabulek do nových se zachováním kompatibilních sloupců</li>
              <li>Ponechává původní tabulky beze změny</li>
              <li>Přidává data do nových tabulek bez přepsání existujících záznamů</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </main>
  )
}
