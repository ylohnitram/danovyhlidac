import HeroSection from "@/components/hero-section"
import TaxCalculator from "@/components/tax-calculator"
import TopContractors from "@/components/top-contractors"
import UnusualContracts from "@/components/unusual-contracts"
import ClientOnly from "@/components/client-only"
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
        <section id="calculator" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Daňový kalkulátor</h2>
          <ClientOnly>
            <TaxCalculator />
          </ClientOnly>
        </section>

        <section id="map" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Mapa veřejných zakázek</h2>
          <ClientOnly>
            <ContractsMap />
          </ClientOnly>
        </section>

        <section id="rankings" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Žebříčky</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Top 10 dodavatelů</h3>
              <ClientOnly>
                <TopContractors />
              </ClientOnly>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Neobvyklé zakázky</h3>
              <ClientOnly>
                <UnusualContracts />
              </ClientOnly>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
