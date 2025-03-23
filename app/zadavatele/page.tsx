import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building, ArrowRight, FileText, Users, Briefcase, Search } from "lucide-react"
import { fetchCityStats, EntityType } from "@/app/actions/city-stats"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"

// Define metadata
export const metadata: Metadata = {
  title: "Zadavatelé veřejných zakázek | MůjDaňovýHlídač",
  description: "Prozkoumejte veřejné zakázky a smlouvy podle zadavatelů. Zjistěte, jak jsou utráceny veřejné prostředky v jednotlivých institucích.",
}

// Contractors list component
export default function ContractorsPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Zadavatelé veřejných zakázek</h1>
      <p className="text-muted-foreground mb-8">
        Prozkoumejte veřejné zakázky a smlouvy zadávané jednotlivými institucemi, úřady, nemocnicemi a dalšími organizacemi.
        Vyberte zadavatele ze seznamu pro detailní přehled veřejných zakázek.
      </p>
      
      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        {/* @ts-expect-error Async Server Component */}
        <ContractorsListContent />
      </Suspense>
      
      <div className="mt-12 bg-blue-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Briefcase className="h-5 w-5 text-blue-600 mr-2" />
          Proč sledovat zakázky podle zadavatelů?
        </h2>
        <p className="mb-4">
          Monitoring veřejných zakázek podle zadavatelů umožňuje sledovat, jak konkrétní instituce nakládají s veřejnými prostředky.
          Díky tomu můžete zjistit, jaké typy zakázek zadávají různé organizace a instituce, kdo jsou jejich dodavatelé 
          a kolik prostředků vynakládají.
        </p>
        <p>
          Vyberte si zadavatele ze seznamu a zjistěte, jaké zakázky zadává a s jakými dodavateli spolupracuje.
        </p>
      </div>
    </main>
  );
}

// The content component that awaits the data
async function ContractorsListContent() {
  // Fetch all entities stats from the database
  const allEntities = await fetchCityStats();
  
  // Filter and categorize entities
  const institutions = allEntities.filter(entity => 
    entity.entityType === "institution" && entity.contractsCount > 0
  );
  
  const companies = allEntities.filter(entity => 
    entity.entityType === "company" && entity.contractsCount > 0
  );
  
  const cities = allEntities.filter(entity => 
    entity.entityType === "city" && entity.contractsCount > 0
  );
  
  const others = allEntities.filter(entity => 
    entity.entityType === "other" && entity.contractsCount > 0
  );
  
  // Sort each category by contract count
  institutions.sort((a, b) => b.contractsCount - a.contractsCount);
  companies.sort((a, b) => b.contractsCount - a.contractsCount);
  cities.sort((a, b) => b.contractsCount - a.contractsCount);
  others.sort((a, b) => b.contractsCount - a.contractsCount);
  
  return (
    <div>
      <div className="relative w-full max-w-lg mx-auto mb-8">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input 
          type="text" 
          placeholder="Hledat zadavatele..." 
          className="pl-10 pr-4 py-2 w-full" 
        />
      </div>
      
      <Tabs defaultValue="institutions">
        <TabsList className="mb-4">
          <TabsTrigger value="institutions">Instituce ({institutions.length})</TabsTrigger>
          <TabsTrigger value="companies">Společnosti ({companies.length})</TabsTrigger>
          <TabsTrigger value="cities">Města ({cities.length})</TabsTrigger>
          <TabsTrigger value="others">Ostatní ({others.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="institutions">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {institutions.map((entity) => (
              <EntityCard key={entity.id} entity={entity} type="institution" />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="companies">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((entity) => (
              <EntityCard key={entity.id} entity={entity} type="company" />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="cities">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cities.map((entity) => (
              <EntityCard key={entity.id} entity={entity} type="city" />
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="others">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((entity) => (
              <EntityCard key={entity.id} entity={entity} type="other" />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Entity card component
function EntityCard({ entity, type }: { entity: any, type: EntityType }) {
  // Choose the appropriate icon based on entity type
  let Icon = Building;
  if (type === "company") Icon = Briefcase;
  else if (type === "city") Icon = Building;
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start">
          <Icon className="h-5 w-5 text-blue-600 mr-3 mt-1" />
          <div className="flex-grow">
            <h2 className="text-xl font-semibold mb-2">{entity.name}</h2>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center">
                <FileText className="h-4 w-4 text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">
                  {entity.contractsCount} zakázek
                </span>
              </div>
              <span className="text-sm font-medium">
                {(entity.totalValue / 1000000).toFixed(0)} mil. Kč
              </span>
            </div>
            <Button asChild>
              <Link href={`/zadavatel/${entity.id}`} className="w-full flex items-center justify-center">
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
