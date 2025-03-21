'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  useEffect(() => {
    const fetchDatabaseInfo = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/admin/db-recovery')
        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`)
        }

        const data = await response.json()
        setTables(data.tables || [])
        setTableCounts(data.tableCounts || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

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
        throw new Error(`API responded with status: ${response.status}`)
      }

      const result = await response.json()
      setRestoreResult(result)

      // Reload table info after restoration
      const infoResponse = await fetch('/api/admin/db-recovery')
      if (infoResponse.ok) {
        const data = await infoResponse.json()
        setTables(data.tables || [])
        setTableCounts(data.tableCounts || [])
      }
    } catch (err) {
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

        {restoreResult && restoreResult.recoveryResults && (
          <Alert variant={restoreResult.recoveryResults.some(r => r.result?.success) ? "default" : "destructive"} 
                 className={restoreResult.recoveryResults.some(r => r.result?.success) ? "bg-green-50 border-green-200" : ""}>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle>Výsledek obnovení</AlertTitle>
            <AlertDescription>
              <div className="space-y-2 mt-2">
                {restoreResult.recoveryResults.map((result, index) => (
                  <div key={index} className="text-sm">
                    {result.source && result.target && (
                      <>
                        {result.result?.success ? (
                          <span className="text-green-700">✓ {result.source} → {result.target}: {result.result.message}</span>
                        ) : (
                          <span className="text-red-700">✗ {result.source} → {result.target}: {result.result?.message}</span>
                        )}
                      </>
                    )}
                    {!result.source && result.target && (
                      <span className="text-amber-700">⚠ {result.target}: {result.result?.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="tables">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tables">Tabulky</TabsTrigger>
            <TabsTrigger value="restore">Obnovení dat</TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="space-y-4">
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
                        <TableHead className="text-right">Počet indexů</TableHead>
                        <TableHead className="text-right">Počet sloupců</TableHead>
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
                              <TableCell className="text-right">{table.index_count}</TableCell>
                              <TableCell className="text-right">{table.column_count}</TableCell>
                              <TableCell className="text-right">
                                {countInfo ? (
                                  <Badge variant={Number(countInfo.count) > 0 ? "default" : "outline"}>
                                    {countInfo.count}
                                  </Badge>
                                ) : "N/A"}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4">
                            Nebyly nalezeny žádné tabulky
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="outline" onClick={() => window.location.reload()} className="ml-auto">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Obnovit
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="restore" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Obnovení původních dat</CardTitle>
                <CardDescription>
                  Tento proces zkopíruje data z původních tabulek (s velkými písmeny) do nových tabulek (s malými písmeny).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Database className="h-4 w-4" />
                  <AlertTitle>Důležité upozornění</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Tento proces:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Zkontroluje existenci původních tabulek (např. "Smlouva") a nových tabulek (např. "smlouva")</li>
                      <li>Pokud existují obě verze a původní tabulky mají data, zkopíruje data z původních do nových tabulek</li>
                      <li>Zachová všechny sloupce, které existují v obou tabulkách</li>
                      <li>Nepřepíše existující data v nových tabulkách, pokud již existují</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col space-y-4">
                  <h3 className="text-lg font-medium">Detekované migrace</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Původní tabulka</TableHead>
                        <TableHead>Nová tabulka</TableHead>
                        <TableHead className="text-right">Záznamy k migraci</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tables.length > 0 ? (
                        ['Smlouva', 'Dodavatel', 'Dodatek', 'Podnet'].map((sourceTable, index) => {
                          const sourceInfo = tableCounts.find(t => t.name === sourceTable)
                          const targetInfo = tableCounts.find(t => t.name === sourceTable.toLowerCase())
                          
                          // Skip if source table doesn't exist
                          if (!sourceInfo) return null;
                          
                          return (
                            <TableRow key={index}>
                              <TableCell className="font-medium">
                                {sourceTable}
                                {sourceInfo && (
                                  <Badge variant="outline" className="ml-2">{sourceInfo.count}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {sourceTable.toLowerCase()}
                                {targetInfo && (
                                  <Badge variant="outline" className="ml-2">{targetInfo.count}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {sourceInfo ? sourceInfo.count : 0}
                              </TableCell>
                              <TableCell>
                                {!targetInfo ? (
                                  <Badge variant="destructive">Cílová tabulka neexistuje</Badge>
                                ) : targetInfo.count > 0 ? (
                                  <Badge variant="secondary">Cílová tabulka má data</Badge>
                                ) : sourceInfo && sourceInfo.count > 0 ? (
                                  <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                                    Připraveno k migraci
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Žádná data k migraci</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        }).filter(Boolean)
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4">
                            Načítání informací o tabulkách...
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => window.location.reload()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Obnovit
                </Button>
                <Button 
                  onClick={handleRestore} 
                  disabled={loading || restoringData}
                >
                  {restoringData ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Obnovování...
                    </>
                  ) : (
                    "Spustit obnovení dat"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
