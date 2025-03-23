import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, FileText, FileBarChart, BarChart, ReceiptText } from "lucide-react"
import { fetchCategoryDetail } from "@/app/actions/category-stats"

// Generate metadata for the page
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const category = await fetchCategoryDetail(params.id);
  
  if (!category) {
    return {
      title: "Kategorie nenalezena | MůjDaňovýHlídač",
      description: "Informace o kategorii nejsou k dispozici."
    };
  }

  return {
    title: `${category.name} - Veřejné zakázky | MůjDaňovýHlídač`,
    description: `Přehled veřejných zakázek v kategorii ${category.name}. ${category.description}`,
    openGraph: {
      title: `${category.name} - Veřejné zakázky`,
      description: `${category.description}. Kompletní přehled veřejných zakázek v této kategorii.`,
      locale: 'cs_CZ',
      type: 'website',
    },
  };
}

// Category statistics component
function CategoryStatistics({ stats }: { stats: any }) {
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
async function CategoryDetailContent({ categoryId }: { categoryId: string }) {
  const category = await fetchCategoryDetail(categoryId);
  
  if (!category) {
    notFound();
  }
  
  // Format dates if available
  const earliestDate = category.stats.earliest_date 
    ? new Date(category.stats.earliest_date).toLocaleDateString('cs-CZ')
    : 'N/A';
  
  const latestDate = category.stats.latest_date
    ? new Date(category.stats.latest_date).toLocaleDateString('cs-CZ')
    : 'N/A';
  
  return (
    <div className="space-y-8">
      <div className="flex items-center mb-2">
        <FileBarChart className="h-5 w-5 text-blue-600 mr-2" />
        <h1 className="text-3xl font-bold">{category.name}</h1>
      </div>
      
      <p className="text-muted-foreground">{category.description}</p>
      
      <div className="flex flex-wrap gap-3 mb-4">
        <Badge variant="outline">{category.stats.contract_count} zakázek</Badge>
        <Badge variant="outline">
          {new Intl.NumberFormat('cs-CZ', { 
            style: 'currency', 
            currency: 'CZK',
            maximumFractionDigits: 0 
          }).format(category.stats.total_value || 0)}
        </Badge>
        <Badge variant="outline">{earliestDate} - {latestDate}</Badge>
      </div>
      
      <CategoryStatistics stats={category.stats} />
      
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Top dodavatelé</TabsTrigger>
          <TabsTrigger value="contracts">Poslední zakázky</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers" className="py-4">
          <TopSuppliers suppliers={category.topSuppliers} />
        </TabsContent>
        <TabsContent value="contracts" className="py-4">
          <Card>
            <CardContent className="pt-6">
              <Button asChild>
                <Link href={`/smlouvy?kategorie=${encodeURIComponent(category.id)}`}>
                  Zobrazit všechny zakázky v této kategorii
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Main category page component
export default function CategoryPage({ params }: { params: { id: string } }) {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/kategorie" className="flex items-center">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zpět na kategorie
          </Link>
        </Button>
      </div>
      
      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        {/* @ts-expect-error Async Server Component */}
        <CategoryDetailContent categoryId={params.id} />
      </Suspense>
    </main>
  );
}
