import HeroSection from "@/components/hero-section"
import TaxCalculator from "@/components/tax-calculator"
import ContractsMap from "@/components/contracts-map"
import TopContractors from "@/components/top-contractors"
import UnusualContracts from "@/components/unusual-contracts"

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <div className="container mx-auto px-4 py-12 space-y-16">
        <section id="calculator" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Daňový kalkulátor</h2>
          <TaxCalculator />
        </section>

        <section id="map" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Mapa veřejných zakázek</h2>
          <ContractsMap />
        </section>

        <section id="rankings" className="scroll-mt-16">
          <h2 className="text-3xl font-bold mb-8">Žebříčky</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Top 10 dodavatelů</h3>
              <TopContractors />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Neobvyklé zakázky</h3>
              <UnusualContracts />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
