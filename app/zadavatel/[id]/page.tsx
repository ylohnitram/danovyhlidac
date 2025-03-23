import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Building, Briefcase, CalendarRange, FileText, Users, MapPin } from "lucide-react"
import { fetchEntityDetail } from "@/app/actions/city-stats"

// Generate dynamic metadata
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const entity = await fetchEntityDetail(params.id);
  
  if (!entity) {
    return {
      title: "Zadavatel nenalezen | MůjDaňovýHlídač",
      description: "Informace o zadavateli nejsou k dispozici."
    }
  }

  return {
    title: `${entity.name} - Veřejné zakázky | MůjDaňovýHlídač`,
    description: `Přehled veřejných zakázek zadavatele ${entity.name}. Zjistěte, jak jsou utráceny veřejné prostředky.`,
    openGraph: {
      title: `${entity.name} - Veřejné zakázky`,
      description: `Zjistěte, jak jsou utráceny veřejné prostředky zadavatelem ${entity.name}. Kompletní přehled veřejných zakázek.`,
      locale: 'cs_CZ',
      type: 'website',
    },
  }
}

// Entity icon component based on type
function EntityIcon({ type }: { type: string }) {
  switch(type) {
    case "city":
      return <MapPin className="h-5 w-5 mr-2 text-blue-600" />;
    case "institution":
      return <Building className="h-5 w-5 mr-2 text-blue-600" />;
    case "company":
      return <Briefcase className="h-5 w-5 mr-2 text-blue-600" />;
    default:
      return <FileText className="h-5 w-5 mr-2 text-blue-600" />;
  }
}

// Entity statistics component
function EntityStatistics({ stats }: { stats: any }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Celková hodnota</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {new Intl.NumberFormat('cs-CZ', { 
              style: 'currency', 
              currency: 'CZK',
              maximumFractionDigits: 0 
            }).format(stats.total_value || 0)}
          </p>
          <p className="text-sm text-muted-foreground">hodnota všech zakázek</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Průměrná zakázka</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {new Intl.NumberFormat('cs-CZ', { 
              style: 'currency', 
              currency: 'CZK',
              maximumFractionDigits: 0 
            }).format(stats.avg_value || 0)}
          </p>
          <p className="text-sm text-muted-foreground">průměrná hodnota</p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Počet dodavatelů</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {stats.supplier_count || 0}
          </p>
          <p className="text-sm text-muted-foreground">unikátních dodavatelů</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Top suppliers component
function TopSuppliers({ suppliers }: { suppliers: any[] }) {
  if (!suppliers || suppliers.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Nebyly nalezeny žádné informace o dodavatelích.
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {suppliers.map((supplier, index) => (
        <Card key={index}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{supplier.dodavatel}</h3>
                <p className="text-sm text-muted-foreground">
                  {supplier.contract_count} zakázek
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">
                  {new Intl.NumberFormat('cs-CZ', { 
                    style: 'currency', 
                    currency: 'CZK',
                    maximumFractionDigits: 0 
                  }).format(supplier.total_value || 0)}
                </p>
                <p className="text-sm text-muted-foreground">
                  celková hodnota
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Content component that awaits the data
async function EntityDetailContent({ entityId }: { entityId: string }) {
  const entity = await fetchEntityDetail(entityId);
  
  if (!entity) {
    notFound();
  }
  
  // Format dates if available
  const earliestDate = entity.stats.earliest_date 
    ? new Date(entity.stats.earliest_date).toLocaleDateString('cs-CZ')
    : 'N/A';
  
  const latestDate = entity.stats.latest_date
    ? new Date(entity.stats.latest_date).toLocaleDateString('cs-CZ')
    : 'N/A';
  
  return (
    <div className="space-y-8">
      <div className="flex items-center mb-2">
        <EntityIcon type={entity.entityType} />
        <h1 className="text-3xl font-bold">{entity.name}</h1>
      </div>
      
      <div className="flex flex-wrap gap-3 mb-4">
        <Badge variant="outline">{entity.contractsCount} zakázek</Badge>
        <Badge variant="outline">
          {new Intl.NumberFormat('cs-CZ', { 
            style: 'currency', 
            currency: 'CZK',
            maximumFractionDigits: 0 
          }).format(entity.totalValue || 0)}
        </Badge>
        {entity.entityType === "city" && entity.population > 0 && (
          <Badge variant="outline">{entity.population.toLocaleString('cs-CZ')} obyvatel</Badge>
        )}
        <Badge variant="outline">{earliestDate} - {latestDate}</Badge>
      </div>
      
      <EntityStatistics stats={entity.stats} />
      
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Top dodavatelé</TabsTrigger>
          <TabsTrigger value="contracts">Poslední zakázky</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers" className="py-4">
          <TopSuppliers suppliers={entity.topSuppliers} />
        </TabsContent>
        <TabsContent value="contracts" className="py-4">
          <Card>
            <CardContent className="pt-6">
              <Button asChild>
                <Link href={`/smlouvy?zadavatel=${encodeURIComponent(entity.name)}`}>
                  Zobrazit všechny zakázky zadavatele
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Main entity page component
export default function EntityPage({ params }: { params: { id: string } }) {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/zadavatele" className="flex items-center">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zpět na seznam zadavatelů
          </Link>
        </Button>
      </div>
      
      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        {/* @ts-expect-error Async Server Component */}
        <EntityDetailContent entityId={params.id} />
      </Suspense>
    </main>
  )
}
