"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  }>({ ready: false });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Check database setup first - we don't attempt migrations anymore
      // but still check if the database schema is available
      const { ensureDatabaseSetup } = await import('@/lib/setup-db');
      const dbSetupResult = await ensureDatabaseSetup();
      
      if (!dbSetupResult.success) {
        setDatabaseStatus({
          ready: false,
          message: dbSetupResult.message || "Databáze není správně nastavena.",
          setupInProgress: false
        });
        
        // Try to load data anyway - in case we have mock data or cached data
        try {
          const result = await getNeobvykleSmlouvy();
          if (result.data && result.data.length > 0) {
            setContracts(result.data);
            setIsCached(result.cached || false);
            // If we have data, consider the database ready for display purposes
            setDatabaseStatus({ ready: true });
          }
        } catch (dataErr) {
          console.error("Nepodařilo se načíst ani zástupná data:", dataErr);
        }
        
        setLoading(false);
        return;
      }
      
      // Database is ready
      setDatabaseStatus({ ready: true });
      
      const result = await getNeobvykleSmlouvy();
      setContracts(result.data);
      setIsCached(result.cached || false);
    } catch (err) {
      console.error("Chyba při načítání neobvyklých zakázek:", err);
      setError("Nepodařilo se načíst data o neobvyklých zakázkách.");
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

  if (error) {
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
  
  if (!databaseStatus.ready) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-2">
        <CacheStatusIndicator
          isCached={isCached}
          onRefresh={loadData}
        />
      </div>
      
      {contracts.map((contract) => (
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
              <a href={`https://smlouvy.gov.cz/smlouva/${contract.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                <span>Zobrazit detail v registru smluv</span>
              </a>
            </Button>
          </CardFooter>
        </Card>
      ))}

      {contracts.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Nebyly nalezeny žádné neobvyklé zakázky.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
