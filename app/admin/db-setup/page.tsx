"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ExternalLink, Loader2, CheckCircle, XCircle, AlertCircle, ShieldAlert } from "lucide-react"

async function checkDatabaseStatus() {
  try {
    const response = await fetch('/api/admin/db-status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 403) {
      return {
        status: 'forbidden',
        message: 'Tento endpoint je v produkčním prostředí zakázán z bezpečnostních důvodů.',
        isProdLocked: true
      };
    }
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error checking database status:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      connected: false,
      hasSchema: false
    };
  }
}

async function initializeDatabase() {
  try {
    const response = await fetch('/api/admin/db-setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 403) {
      return {
        success: false,
        message: 'Tento endpoint je v produkčním prostředí zakázán z bezpečnostních důvodů.',
        isProdLocked: true
      };
    }
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error initializing database:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default function DatabaseSetupPage() {
  const [loading, setLoading] = useState<boolean>(false);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [statusResult, setStatusResult] = useState<any>(null);
  const [setupResult, setSetupResult] = useState<any>(null);
  const [isProdLocked, setIsProdLocked] = useState<boolean>(false);

  const handleCheckStatus = async () => {
    setStatusLoading(true);
    setStatusResult(null);
    
    try {
      const result = await checkDatabaseStatus();
      setStatusResult(result);
      
      if (result.isProdLocked) {
        setIsProdLocked(true);
      }
    } catch (error) {
      setStatusResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleInitializeDb = async () => {
    setLoading(true);
    setSetupResult(null);
    
    try {
      const result = await initializeDatabase();
      setSetupResult(result);
      
      if (result.isProdLocked) {
        setIsProdLocked(true);
      }
      
      // Pokud inicializace proběhla úspěšně, aktualizujeme i status
      if (result.success) {
        await handleCheckStatus();
      }
    } catch (error) {
      setSetupResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Nastavení databáze</h1>
        
        {isProdLocked && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Omezení produkčního prostředí</AlertTitle>
            <AlertDescription>
              <p className="mb-2">
                Správa databáze je v produkčním prostředí zakázána z bezpečnostních důvodů.
              </p>
              <p className="font-medium">Pro povolení této funkce:</p>
              <ol className="list-decimal list-inside pl-4 space-y-1 mt-2">
                <li>Nastavte proměnnou prostředí <code className="bg-red-100 px-1 rounded">ENABLE_DB_DEBUG=true</code> ve vaší Vercel konfiguraci</li>
                <li>Restartujte aplikaci nebo znovu nasaďte (deploy) vaše řešení</li>
              </ol>
            </AlertDescription>
          </Alert>
        )}
        
        {!isProdLocked && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Důležité upozornění</AlertTitle>
            <AlertDescription>
              Na stránce se vyskytuje problém s databázovým schématem. Tabulka &quot;smlouva&quot; 
              v databázi nebyla nalezena. Je potřeba provést inicializaci databáze pomocí migrací.
            </AlertDescription>
          </Alert>
        )}
        
        {statusResult?.status === 'success' && statusResult?.counts && (
          <Alert variant="success" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Databáze je inicializována</AlertTitle>
            <AlertDescription className="text-green-700">
              Databáze obsahuje {statusResult.counts.total} záznamů. Vše je připraveno k použití.
            </AlertDescription>
          </Alert>
        )}
        
        {setupResult?.success && (
          <Alert variant="success" className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Inicializace úspěšná</AlertTitle>
            <AlertDescription className="text-green-700">
              {setupResult.message}
            </AlertDescription>
          </Alert>
        )}
        
        {(setupResult && !setupResult.success && !setupResult.isProdLocked) && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Chyba při inicializaci</AlertTitle>
            <AlertDescription>
              {setupResult.message || 'Došlo k neznámé chybě při inicializaci databáze.'}
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stav databáze</CardTitle>
              <CardDescription>
                Informace o aktuálním stavu databáze a jejím připojení
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Pro zjištění stavu databáze musíte spustit kontrolu. Tato akce ověří připojení 
                k databázi a existenci požadovaných tabulek.
              </p>
              
              {statusResult && !statusLoading && !statusResult.isProdLocked && (
                <div className="mb-4 p-4 bg-gray-50 rounded-md">
                  <h3 className="font-medium mb-2">Výsledek kontroly:</h3>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="font-medium">Status:</span> {statusResult.status === 'success' ? 'Úspěch' : 'Chyba'}
                    </p>
                    {statusResult.connected !== undefined && (
                      <p>
                        <span className="font-medium">Připojení k databázi:</span> {statusResult.connected ? 'Úspěšné' : 'Neúspěšné'}
                      </p>
                    )}
                    {statusResult.hasSchema !== undefined && (
                      <p>
                        <span className="font-medium">Databázové schema:</span> {statusResult.hasSchema ? 'Existuje' : 'Chybí'}
                      </p>
                    )}
                    {statusResult.tables && (
                      <p>
                        <span className="font-medium">Nalezené tabulky:</span> {statusResult.tables.length > 0 ? statusResult.tables.join(', ') : 'Žádné'}
                      </p>
                    )}
                    {statusResult.message && (
                      <p className="text-gray-600">{statusResult.message}</p>
                    )}
                  </div>
                </div>
              )}
              
              <Button onClick={handleCheckStatus} disabled={statusLoading || isProdLocked}>
                {statusLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Kontrola probíhá...
                  </>
                ) : (
                  'Zkontrolovat stav databáze'
                )}
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Spustit migrace</CardTitle>
              <CardDescription>
                Inicializovat databázi a vytvořit potřebné tabulky
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Pokud databáze není inicializována, použijte toto tlačítko ke spuštění 
                všech migrací a vytvoření potřebných tabulek.
              </p>
              
              <Button onClick={handleInitializeDb} variant="destructive" disabled={loading || isProdLocked}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inicializace probíhá...
                  </>
                ) : (
                  'Inicializovat databázi'
                )}
              </Button>
              
              <p className="text-sm text-muted-foreground mt-4">
                Tato akce je bezpečná, pokud databáze už existuje, nebudou provedeny žádné změny.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Nápověda k řešení problémů</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProdLocked ? (
              <div>
                <h3 className="font-medium mb-2">Provoz v produkčním prostředí</h3>
                <p className="text-muted-foreground mb-2">
                  Z bezpečnostních důvodů jsou nástroje pro správu databáze v produkčním prostředí standardně zakázány.
                  Pro povolení těchto nástrojů postupujte následovně:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Přejděte do nastavení projektu ve Vercel dashboardu</li>
                  <li>V sekci "Environment Variables" přidejte novou proměnnou <code className="bg-gray-100 px-1 rounded">ENABLE_DB_DEBUG</code> s hodnotou <code className="bg-gray-100 px-1 rounded">true</code></li>
                  <li>Restartujte aplikaci nebo proveďte nový deployment</li>
                  <li>Po dokončení správy databáze doporučujeme tuto proměnnou odstranit pro zvýšení bezpečnosti</li>
                </ol>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="font-medium mb-2">Chyba: &quot;relation &quot;smlouva&quot; does not exist&quot;</h3>
                  <p className="text-muted-foreground mb-2">
                    Tato chyba znamená, že databáze je dostupná, ale neobsahuje tabulku &quot;smlouva&quot;.
                    Řešením je spustit migrace, které vytvoří potřebné tabulky.
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>Klikněte na tlačítko &quot;Inicializovat databázi&quot; výše</li>
                    <li>Pokud to nefunguje, zkuste spustit migrace manuálně pomocí CLI</li>
                    <li>Ujistěte se, že proměnná prostředí DATABASE_URL je správně nastavena</li>
                  </ol>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Chyba připojení k databázi</h3>
                  <p className="text-muted-foreground mb-2">
                    Pokud se nelze připojit k databázi, zkontrolujte:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>Správnost připojovacího řetězce v proměnné DATABASE_URL</li>
                    <li>Dostupnost databázového serveru</li>
                    <li>Nastavení firewallu a přístupová práva</li>
                  </ul>
                </div>
              </>
            )}
            
            <div className="pt-2">
              <Button variant="outline" asChild>
                <a href="https://www.prisma.io/docs/getting-started/setup-prisma/add-to-existing-project" target="_blank" rel="noopener noreferrer" className="flex items-center">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Dokumentace Prisma
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
