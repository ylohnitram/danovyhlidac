"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle } from "lucide-react"

type CacheStats = {
  performance: {
    hits: number
    misses: number
    ratio: number
    lastReset: string
  }
  counts: {
    smlouvyList: number
    smlouvaDetail: number
    stats: number
    total: number
  }
  memory: any
  timestamp: string
}

export default function CacheDashboard() {
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearingCache, setClearingCache] = useState(false)
  const [clearSuccess, setClearSuccess] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState<boolean>(false)

  // Fetch cache statistics
  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    setAuthError(false)

    try {
      // No token needed - we simplified the authentication logic
      const response = await fetch("/api/cache/stats");
      
      // Check for auth errors specifically
      if (response.status === 401 || response.status === 403) {
        setAuthError(true);
        const errorData = await response.json();
        setError(`Authentication error: ${errorData.error || 'Access denied'}`);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error("Error fetching cache stats:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Clear all cache
  const clearCache = async () => {
    setClearingCache(true);
    setClearSuccess(null);
    setAuthError(false);

    try {
      // No token needed - we simplified the authentication logic
      const response = await fetch("/api/cache", {
        method: "POST"
      });
      
      // Check for auth errors specifically
      if (response.status === 401 || response.status === 403) {
        setAuthError(true);
        const errorData = await response.json();
        setError(`Authentication error: ${errorData.error || 'Access denied'}`);
        setClearingCache(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      setClearSuccess(true);

      // Refresh stats after clearing
      setTimeout(fetchStats, 1000);
    } catch (err) {
      console.error("Error clearing cache:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setClearSuccess(false);
    } finally {
      setClearingCache(false);
    }
  }

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cache Dashboard</h1>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchStats} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Obnovit
          </Button>

          <Button variant="destructive" onClick={clearCache} disabled={clearingCache}>
            {clearingCache ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Vymazat cache
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chyba</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {authError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chyba autorizace</AlertTitle>
          <AlertDescription>
            <p>Nemáte oprávnění k přístupu k této funkcionalitě.</p>
            <p className="mt-2">
              Pro povolení přístupu je potřeba nastavit proměnné prostředí CACHE_ADMIN_TOKEN a ENABLE_DB_DEBUG=true ve vašem Vercel projektu.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {clearSuccess === true && (
        <Alert variant="default" className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>Úspěch</AlertTitle>
          <AlertDescription>Cache byla úspěšně vymazána.</AlertDescription>
        </Alert>
      )}

      {clearSuccess === false && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chyba</AlertTitle>
          <AlertDescription>Nepodařilo se vymazat cache.</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : stats ? (
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Přehled</TabsTrigger>
            <TabsTrigger value="performance">Výkon</TabsTrigger>
            <TabsTrigger value="details">Detaily</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Přehled cache</CardTitle>
                <CardDescription>Poslední aktualizace: {formatDate(stats.timestamp)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Využití cache</span>
                    <span className="text-sm font-medium">{Math.round(stats.performance.ratio * 100)}%</span>
                  </div>
                  <Progress value={stats.performance.ratio * 100} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Celkem záznamů v cache</p>
                    <p className="text-2xl font-bold">{stats.counts.total}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Poměr cache hitů</p>
                    <p className="text-2xl font-bold">
                      {stats.performance.hits} / {stats.performance.hits + stats.performance.misses}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Seznam smluv</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stats.counts.smlouvyList}</p>
                  <p className="text-sm text-muted-foreground">záznamů</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Detail smluv</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stats.counts.smlouvaDetail}</p>
                  <p className="text-sm text-muted-foreground">záznamů</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Statistiky</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stats.counts.stats}</p>
                  <p className="text-sm text-muted-foreground">záznamů</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <Card>
              <CardHeader>
                <CardTitle>Výkon cache</CardTitle>
                <CardDescription>Statistiky výkonu od {formatDate(stats.performance.lastReset)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Cache Hits</p>
                    <p className="text-2xl font-bold">{stats.performance.hits}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Cache Misses</p>
                    <p className="text-2xl font-bold">{stats.performance.misses}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Hit Ratio</p>
                    <p className="text-2xl font-bold">{Math.round(stats.performance.ratio * 100)}%</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">Hit Ratio</span>
                    <span className="text-sm font-medium">{Math.round(stats.performance.ratio * 100)}%</span>
                  </div>
                  <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.round(stats.performance.ratio * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Detaily cache</CardTitle>
                <CardDescription>Technické detaily o cache</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96">{JSON.stringify(stats, null, 2)}</pre>
              </CardContent>
              <CardFooter>
                <p className="text-sm text-muted-foreground">
                  Tyto informace jsou určeny pro vývojáře a administrátory.
                </p>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">Nepodařilo se načíst statistiky cache.</p>
            <Button variant="outline" onClick={fetchStats}>
              Zkusit znovu
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
