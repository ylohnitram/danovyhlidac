'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Database, AlertTriangle, CheckCircle, RefreshCw, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export default function DatabaseInspectorPage() {
  const [loading, setLoading] = useState(true)
  const [tableData, setTableData] = useState<any>({})
  const [error, setError] = useState<string | null>(null)
  const [clearingData, setClearingData] = useState(false)
  const [clearResult, setClearResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('smlouva')

  // Load database information
  const fetchDatabaseInfo = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-inspector')
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const data = await response.json()
      console.log("API response:", data)
      
      setTableData(data.tables || {})
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

  // Clear all data
  const handleClearData = async () => {
    setClearingData(true)
    setClearResult(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-inspector?mode=clear', {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Clear result:", result)
      setClearResult(result)

      // Reload table info after clearing
      fetchDatabaseInfo()
    } catch (err) {
      console.error("Error clearing data:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClearingData(false)
    }
  }

  // Insert sample data
  const handleInsertSample = async () => {
    setClearingData(true)
    setClearResult(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-inspector?mode=sample', {
        method: 'POST'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Sample insert result:", result)
      setClearResult(result)

      // Reload table info after insertion
      fetchDatabaseInfo()
    } catch (err) {
      console.error("Error inserting sample data:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClearingData(false)
    }
  }

  // Format data for display
  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">null</span>
    }
    
    if (typeof value === 'object') {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  const getTableRows = (tableName: string) => {
    const table = tableData[tableName];
    if (!table || !table.data || !Array.isArray(table.data)) {
      return [];
    }
    return table.data;
  }

  const getTableColumns = (tableName: string) => {
    const rows = getTableRows(tableName);
    if (rows.length === 0) {
      return [];
    }
    
    // Get columns from the first row
    return Object.keys(rows[0]);
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Inspekce dat databáze</h1>
        <p className="text-muted-foreground">
          Tato stránka umožňuje prohlížet, mazat a testovat data v databázi.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Chyba</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {clearResult && clearResult.success && (
          <Alert variant="default" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle>Operace dokončena</AlertTitle>
            <AlertDescription>
              {clearResult.message || "Operace byla úspěšně dokončena."}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={fetchDatabaseInfo} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Obnovit
          </Button>
          
          <div className="space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Vymazat všechna data
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Potvrdit vymazání dat</DialogTitle>
                  <DialogDescription>
                    Tato akce vymaže všechna data z tabulek smlouva, dodavatel, dodatek a podnet.
                    Tuto akci nelze vrátit.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Zrušit</Button>
                  <Button variant="destructive" onClick={handleClearData} disabled={clearingData}>
                    {clearingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Vymazat všechna data
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="default" onClick={handleInsertSample} disabled={clearingData}>
              {clearingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Vložit testovací data
            </Button>
          </div>
        </div>

        <Tabs defaultValue="smlouva" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="smlouva">Smlouvy</TabsTrigger>
            <TabsTrigger value="dodavatel">Dodavatelé</TabsTrigger>
            <TabsTrigger value="dodatek">Dodatky</TabsTrigger>
            <TabsTrigger value="podnet">Podněty</TabsTrigger>
          </TabsList>

          {['smlouva', 'dodavatel', 'dodatek', 'podnet'].map(tableName => (
            <TabsContent key={tableName} value={tableName} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Tabulka: {tableName}</CardTitle>
                  <CardDescription>
                    {tableData[tableName]?.count > 0 
                      ? `Zobrazuje se ${tableData[tableName]?.data?.length || 0} z ${tableData[tableName]?.count} záznamů` 
                      : 'Žádná data'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center items-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  ) : tableData[tableName]?.data?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {getTableColumns(tableName).map(column => (
                              <TableHead key={column}>{column}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getTableRows(tableName).map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {getTableColumns(tableName).map(column => (
                                <TableCell key={column}>{formatValue(row[column])}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Tabulka neobsahuje žádná data
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Informace</AlertTitle>
          <AlertDescription>
            <p>Tento nástroj vám umožňuje kontrolovat a spravovat data v databázi.</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Pomocí tlačítka "Vymazat všechna data" můžete odstranit veškerá data z databáze.</li>
              <li>Tlačítko "Vložit testovací data" vytvoří základní testovací záznamy pro ověření funkčnosti.</li>
              <li>Data v tabulkách jsou skutečná data z databáze. Můžete tak zkontrolovat, zda jsou správně formátována.</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </main>
  )
}
