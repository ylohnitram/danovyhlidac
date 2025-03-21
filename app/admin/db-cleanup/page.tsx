'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Trash2, 
  ShieldAlert,
  Database,
  ArrowRight
} from "lucide-react"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"

// Define a more specific type for tables info
interface TablesInfo {
  tablesToRemove?: Array<{name: string, reason: string, original: string}>;
  unknownTables?: Array<{name: string, reason: string}>;
  safeToKeep?: Array<{name: string}>;
}

export default function DatabaseCleanupPage() {
  const [loading, setLoading] = useState(true)
  const [tablesInfo, setTablesInfo] = useState<TablesInfo>({
    tablesToRemove: [],
    unknownTables: [],
    safeToKeep: []
  })
  const [error, setError] = useState<string | null>(null)
  const [removingTables, setRemovingTables] = useState(false)
  const [removeResult, setRemoveResult] = useState<any>(null)
  const [includeUnknown, setIncludeUnknown] = useState(false)
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [showDialog, setShowDialog] = useState(false)

  // Load database information
  const fetchDatabaseInfo = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/db-cleanup')
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const data = await response.json()
      console.log("API response:", data)
      
      setTablesInfo(data.tables || {
        tablesToRemove: [],
        unknownTables: [],
        safeToKeep: []
      })
      
      // Default selected tables are those marked for removal
      if (data.tables?.tablesToRemove) {
        setSelectedTables(data.tables.tablesToRemove.map((t: any) => t.name))
      }
    } catch (err) {
      console.error("Error fetching tables info:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load data on mount
  useEffect(() => {
    fetchDatabaseInfo()
  }, [])

  // Handle table removal
  const handleRemoveTables = async () => {
    // First show confirmation dialog
    setShowDialog(true)
  }
  
  // Confirm and execute table removal
  const confirmRemoveTables = async () => {
    setShowDialog(false)
    setRemovingTables(true)
    setRemoveResult(null)
    setError(null)

    try {
      const tablesToRemove = selectedTables;
      
      if (tablesToRemove.length === 0) {
        throw new Error("Nejsou vybrány žádné tabulky k odstranění")
      }
      
      const response = await fetch(`/api/admin/db-cleanup${includeUnknown ? '?includeUnknown=true' : ''}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tables: tablesToRemove
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `API responded with status: ${response.status}`)
      }

      const result = await response.json()
      console.log("Remove result:", result)
      setRemoveResult(result)

      // Reload tables info after removal
      fetchDatabaseInfo()
    } catch (err) {
      console.error("Error removing tables:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemovingTables(false)
    }
  }

  // Toggle table selection
  const toggleTableSelection = (tableName: string) => {
    setSelectedTables(prev => 
      prev.includes(tableName)
        ? prev.filter(t => t !== tableName)
        : [...prev, tableName]
    )
  }

  // Toggle all tables in a category
  const toggleAllInCategory = (tables: any[], selected: boolean) => {
    if (!tables || tables.length === 0) return;
    
    const tableNames = tables.map(t => t.name)
    
    if (selected) {
      // Add all tables that aren't already selected
      setSelectedTables(prev => [...new Set([...prev, ...tableNames])])
    } else {
      // Remove all tables in the category
      setSelectedTables(prev => prev.filter(t => !tableNames.includes(t)))
    }
  }

  // Check if all tables in a category are selected
  const areAllSelected = (tables: any[]) => {
    if (!tables || tables.length === 0) return false;
    
    const tableNames = tables.map(t => t.name)
    return tableNames.every(name => selectedTables.includes(name))
  }

  // Check if some tables in a category are selected
  const areSomeSelected = (tables: any[]) => {
    if (!tables || tables.length === 0) return false;
    
    const tableNames = tables.map(t => t.name)
    return tableNames.some(name => selectedTables.includes(name)) && !areAllSelected(tables)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Vyčištění databáze</h1>
        <p className="text-muted-foreground">
          Tato stránka umožňuje odstranit tabulky, které nemají v systému co dělat, včetně jejich definic.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Chyba</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {removeResult && removeResult.success && (
          <Alert variant="default" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle>Operace dokončena</AlertTitle>
            <AlertDescription>
              <p>Odstranění tabulek bylo úspěšně dokončeno.</p>
              {removeResult.results && removeResult.results.length > 0 && (
                <div className="mt-2 space-y-1 text-sm">
                  {removeResult.results.map((result: any, index: number) => (
                    <div key={index}>
                      {result.success ? (
                        <span className="text-green-700">✓ {result.table}: {result.message}</span>
                      ) : (
                        <span className="text-red-700">✗ {result.table}: {result.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={fetchDatabaseInfo} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Obnovit
          </Button>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="include-unknown"
              checked={includeUnknown}
              onCheckedChange={setIncludeUnknown}
              disabled={loading || removingTables}
            />
            <Label htmlFor="include-unknown">Zahrnout neznámé tabulky</Label>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tabulky s nekonzistentními názvy</CardTitle>
            <CardDescription>
              Tabulky, které mají nekonzistentní názvy a měly by být odstraněny
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Tables to remove section */}
                <div>
                  <div className="flex items-center mb-2">
                    <Checkbox 
                      id="select-all-to-remove"
                      checked={tablesInfo.tablesToRemove && tablesInfo.tablesToRemove.length > 0 && areAllSelected(tablesInfo.tablesToRemove)}
                      onCheckedChange={(checked) => toggleAllInCategory(tablesInfo.tablesToRemove || [], !!checked)}
                      className="mr-2"
                    />
                    <Label htmlFor="select-all-to-remove" className="font-medium">
                      Duplicitní tabulky 
                      <Badge variant="destructive" className="ml-2">
                        {tablesInfo.tablesToRemove?.length || 0}
                      </Badge>
                    </Label>
                  </div>
                  
                  {tablesInfo.tablesToRemove && tablesInfo.tablesToRemove.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Název tabulky</TableHead>
                          <TableHead>Důvod</TableHead>
                          <TableHead>Standardní název</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tablesInfo.tablesToRemove.map((table: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox 
                                checked={selectedTables.includes(table.name)}
                                onCheckedChange={() => toggleTableSelection(table.name)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{table.name}</TableCell>
                            <TableCell>{table.reason}</TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Badge variant="outline">{table.original}</Badge>
                                <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
                                <Badge variant="default">{table.name}</Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">
                      Nebyly nalezeny žádné duplicitní tabulky
                    </p>
                  )}
                </div>
                
                {/* Unknown tables section */}
                {includeUnknown && tablesInfo.unknownTables && tablesInfo.unknownTables.length > 0 && (
                  <div>
                    <div className="flex items-center mb-2">
                      <Checkbox 
                        id="select-all-unknown"
                        checked={areAllSelected(tablesInfo.unknownTables)}
                        onCheckedChange={(checked) => toggleAllInCategory(tablesInfo.unknownTables, !!checked)}
                        className="mr-2"
                      />
                      <Label htmlFor="select-all-unknown" className="font-medium">
                        Neznámé tabulky 
                        <Badge variant="secondary" className="ml-2">
                          {tablesInfo.unknownTables.length}
                        </Badge>
                      </Label>
                    </div>
                    
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Název tabulky</TableHead>
                          <TableHead>Důvod</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tablesInfo.unknownTables.map((table: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Checkbox 
                                checked={selectedTables.includes(table.name)}
                                onCheckedChange={() => toggleTableSelection(table.name)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{table.name}</TableCell>
                            <TableCell>{table.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                {/* Safe tables section */}
                <div>
                  <h3 className="font-medium mb-2">Standardní tabulky (bezpečné)</h3>
                  <div className="flex flex-wrap gap-2">
                    {tablesInfo.safeToKeep && tablesInfo.safeToKeep.map((table: any, index: number) => (
                      <Badge key={index} variant="outline" className="bg-green-50">
                        {table.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <div className="text-sm text-muted-foreground">
              Vybráno {selectedTables.length} tabulek k odstranění
            </div>
            
            <Button
              variant="destructive"
              onClick={handleRemoveTables}
              disabled={loading || removingTables || selectedTables.length === 0}
              className="ml-auto"
            >
              {removingTables ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Odstranit vybrané tabulky
            </Button>
          </CardFooter>
        </Card>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Důležité upozornění</AlertTitle>
          <AlertDescription>
            <p className="mb-2">Tato akce je nevratná a zcela odstraní vybrané tabulky z databáze včetně všech dat a definic struktur.</p>
            <p>Používejte tento nástroj pouze v případě, že potřebujete vyčistit databázi od neplatných nebo duplicitních tabulek.</p>
          </AlertDescription>
        </Alert>
      </div>
      
      {/* Confirmation dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potvrzení odstranění tabulek</DialogTitle>
            <DialogDescription>
              Chystáte se odstranit {selectedTables.length} tabulek z databáze. Tento krok nelze vrátit.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-auto">
            <ul className="space-y-1 text-sm">
              {selectedTables.map(tableName => (
                <li key={tableName} className="flex items-center">
                  <Trash2 className="h-3 w-3 mr-2 text-red-500" />
                  {tableName}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Zrušit
            </Button>
            <Button variant="destructive" onClick={confirmRemoveTables}>
              {removingTables ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Potvrdit odstranění
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
