"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getNeobvykleSmlouvy } from "@/app/actions/anomalie"
import CacheStatusIndicator from "@/components/cache-status-indicator"

export default function UnusualContracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<{
    ready: boolean;
    message?: string;
    setupInProgress?: boolean;
  }>({ ready: true });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getNeobvykleSmlouvy();
      
      // Set database status from API response
      if (result.dbStatus) {
        setDatabaseStatus({
          ready: result.dbStatus.ready,
          message: result.dbStatus.message,
          setupInProgress: false
        });
      }
      
      // Set contracts data
      if (result.data && result.data.length > 0) {
        setContracts(result.data);
        setIsCached(result.cached || false);
      } else {
        setContracts([]);
      }
    } catch (err) {
      console.error("Chyba při načítání neobvyklých zakázek:", err);
      setError("Nepodařilo se načíst data o neobvyklých zakázkách.");
      
      // Set database as not ready if we couldn't fetch data
      setDatabaseStatus({
        ready: false,
        message: err instanceof Error ? err.message : "Neznámá chyba při načítání dat",
      });
    } finally {
      setLoading(false);
    }
  };

  // Načíst data při prvním načtení komponenty
  useEffect(() => {
    loadData();
  }, []);

  // Formátování data
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-6">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && contracts.length === 0) {
    return (
      <div className="text-center text-red-500 py-4">
        <p>{error}</p>
        <Button onClick={loadData} variant="outline" className="mt-2">
          <RefreshCw className="h-4 w-4 mr-2" />
          Zkusit znovu
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between mb-2">
        <div>
          {!databaseStatus.ready && (
            <Alert variant="warning" className="mb-4 bg-amber-50 border-amber-200">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Problém s databází</AlertTitle>
              <AlertDescription className="text-amber-700">
                {databaseStatus.message || "Databáze není správně nakonfigurována."}
              </AlertDescription>
            </Alert>
          )}
        </div>
        
        <CacheStatusIndicator
          isCached={isCached}
          onRefresh={loadData}
        />
      </div>
      
      {!databaseStatus.ready && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-medium">Problém s databází</h3>
            </div>
            <p className="text-muted-foreground mb-4">
              {databaseStatus.message || "Databáze není správně nakonfigurována. Data nelze načíst."}
            </p>
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Zkusit znovu
            </Button>
          </CardContent>
        </Card>
      )}
      
      {databaseStatus.ready && contracts.length > 0 ? (
        contracts.map((contract) => (
          <Card key={contract.id} className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
                <div>
                  <CardTitle className="text-base">{contract.title}</CardTitle>
                  <CardDescription className="text-amber-700 mt-1">
                    {formatDate(contract.date)} • {contract.amount.toLocaleString("cs-CZ")} Kč
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2">
              <p className="text-sm text-amber-900">{contract.description}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                {contract.flags.map((flag: string, index: number) => (
                  <Badge key={index} variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                    {flag}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-800 hover:text-amber-900 hover:bg-amber-100 p-0 h-auto"
                asChild
              >
                <a href={contract.odkaz} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  <span>Zobrazit detail v registru smluv</span>
                </a>
              </Button>
            </CardFooter>
          </Card>
        ))
      ) : databaseStatus.ready ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Nebyly nalezeny žádné neobvyklé zakázky v databázi.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Je možné, že žádná zakázka nesplňuje kritéria pro označení jako neobvyklá,
              nebo databáze neobsahuje dostatek dat pro analýzu.
            </p>
            <Button onClick={loadData} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Obnovit
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
