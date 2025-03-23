import HeroSection from "@/components/hero-section"
import TaxCalculator from "@/components/tax-calculator"
import TopContractors from "@/components/top-contractors"
import UnusualContracts from "@/components/unusual-contracts"
import ClientOnly from "@/components/client-only"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, FileText, MapPin, BarChart3 } from "lucide-react"
import dynamic from "next/dynamic"

// Používáme dynamic import pro ContractsMap
const ContractsMap = dynamic(() => import('@/components/contracts-map'), {
  loading: () => <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">Načítání mapy...</div>
})

export default function Home() {
  return (
    <main className="min-h-screen">
      <ClientOnly>
        <HeroSection />
      </ClientOnly>
      
      <div className="container mx-auto px-4 py-12 space-y-16">
        {/* Navigation Cards Section */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5 text-blue-600" />
                Smlouvy
              </CardTitle>
              <CardDescription>
                Vyhledávejte a procházejte veřejné smlouvy z registru smluv
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/smlouvy" className="flex items-center justify-center">
                  Procházet smlouvy
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="mr-2 h-5 w-5 text-blue-600" />
                Města a zadavatelé
              </CardTitle>
              <CardDescription>
                Zjistěte, jak hospodaří vaše město nebo instituce s veřejnými prostředky
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/mesta" className="flex items-center justify-center">
                  Procházet podle měst
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-2 h-5 w-5 text-blue-600" />
                Kategorie
              </CardTitle>
              <CardDescription>
                Zakázky podle kategorií - doprava, školství, zdravotnictví a další
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/kategorie" className="flex items-center justify-center">
                  Procházet kategorie
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
        
        {/* Tax Calculator Section */}
        <section id="calculator" className="scroll-mt-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold">Daňový kalkulátor</h2>
            <p className="text-muted-foreground mt-2">
              Spočítejte si, kolik z vašich daní jde na veřejné zakázky a jak jsou tyto prostředky využívány
            </p>
          </div>
          <ClientOnly>
            <TaxCalculator />
          </ClientOnly>
        </section>

        {/* Analytics Section with Tabs */}
        <section id="analytics" className="scroll-mt-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold">Přehledy a analýzy</h2>
            <p className="text-muted-foreground mt-2">
              Prozkoumejte analýzy veřejných zakázek, top dodavatele a neobvyklé smlouvy
            </p>
          </div>
          
          <Tabs defaultValue="map">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="map">Mapa zakázek</TabsTrigger>
              <TabsTrigger value="contractors">Top dodavatelé</TabsTrigger>
              <TabsTrigger value="unusual">Neobvyklé zakázky</TabsTrigger>
            </TabsList>
            
            <TabsContent value="map" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Mapa veřejných zakázek</CardTitle>
                  <CardDescription>
                    Geografické rozložení veřejných zakázek v České republice
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ClientOnly>
                    <ContractsMap />
                  </ClientOnly>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="contractors" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top dodavatelé</CardTitle>
                  <CardDescription>
                    Seznam největších dodavatelů podle objemu zakázek
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ClientOnly>
                    <TopContractors />
                  </ClientOnly>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="unusual" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Neobvyklé zakázky</CardTitle>
                  <CardDescription>
                    Zakázky, které se vymykají běžným standardům
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ClientOnly>
                    <UnusualContracts />
                  </ClientOnly>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  )
}
