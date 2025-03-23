import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, ArrowRight, Building, FileText, Users, InfoIcon } from "lucide-react"
import { fetchActualCityStats } from "@/app/actions/city-stats"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Define metadata
export const metadata: Metadata = {
  title: "Seznam měst | MůjDaňovýHlídač",
  description: "Prozkoumejte veřejné zakázky a smlouvy v jednotlivých městech České republiky. Zjistěte, jak jsou utráceny veřejné prostředky ve vašem městě.",
}

// Cities list component
export default function CitiesPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Veřejné zakázky podle měst</h1>
      <p className="text-muted-foreground mb-4">
        Prozkoumejte veřejné zakázky a smlouvy v jednotlivých městech České republiky.
        Vyberte město ze seznamu pro detailní přehled veřejných zakázek.
      </p>
      
      <Alert className="bg-blue-50 border-blue-200 mb-6">
        <InfoIcon className="h-4 w-4 text-blue-600" />
        <AlertTitle>Tip</AlertTitle>
        <AlertDescription>
          Pokud hledáte zakázky konkrétních institucí (nemocnice, úřady nebo jiné organizace), 
          podívejte se na stránku <Link href="/zadavatele" className="text-blue-600 hover:underline">Zadavatelé</Link>.
        </AlertDescription>
      </Alert>
      
      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        {/* @ts-expect-error Async Server Component */}
        <CityListContent />
      </Suspense>
      
      <div className="mt-12 bg-blue-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Building className="h-5 w-5 text-blue-600 mr-2" />
          Proč je důležité sledovat zakázky ve vašem městě?
        </h2>
        <p className="mb-4">
          Monitoring veřejných zakázek v jednotlivých městech pomáhá zvyšovat transparentnost
          veřejné správy a efektivitu vynakládání veřejných prostředků. Občané mají právo vědět,
          jak jsou jejich daně využívány a na jaké projekty jsou vynakládány.
        </p>
        <p>
          Vyberte si vaše město ze seznamu a zjistěte, jak jsou utráceny veřejné prostředky
          ve vašem okolí. Sledujte zakázky, jejich hodnotu, dodavatele a další informace.
        </p>
      </div>
    </main>
  );
}

// The content component that awaits the data
async function CityListContent() {
  // Fetch city stats from the database - only actual cities, now properly deduplicated
  const cityStats = await fetchActualCityStats();
  
  // Separate cities with contracts and without contracts
  const citiesWithContracts = cityStats.filter(city => city.contractsCount > 0);
  const citiesWithoutContracts = cityStats.filter(city => city.contractsCount === 0);
  
  // Sort cities with contracts by contract count (descending)
  citiesWithContracts.sort((a, b) => b.contractsCount - a.contractsCount);
  
  // Sort cities without contracts by population (descending)
  citiesWithoutContracts.sort((a, b) => b.population - a.population);
  
  // Combine both lists, with cities with contracts first
  const sortedCities = [...citiesWithContracts, ...citiesWithoutContracts];
  
  return (
    <div>
      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">Všechna města</TabsTrigger>
          <TabsTrigger value="with-contracts">Města se zakázkami ({citiesWithContracts.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedCities.map((city) => (
              <CityCard key={city.id} city={city} />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="with-contracts">
          {citiesWithContracts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {citiesWithContracts.map((city) => (
                <CityCard key={city.id} city={city} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>V databázi zatím nejsou žádná města se zakázkami.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// City card component
function CityCard({ city }: { city: any }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start">
          <MapPin className="h-5 w-5 text-blue-600 mr-3 mt-1" />
          <div className="flex-grow">
            <h2 className="text-xl font-semibold mb-2">{city.name}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
              <div className="flex items-center">
                <Users className="h-4 w-4 text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">
                  {city.population.toLocaleString('cs-CZ')} obyvatel
                </span>
              </div>
              <div className="flex items-center">
                <FileText className="h-4 w-4 text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">
                  {city.contractsCount} zakázek
                </span>
              </div>
            </div>
            <Button asChild>
              <Link href={`/zadavatel/${city.id}`} className="w-full flex items-center justify-center">
                Prozkoumat zakázky
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
