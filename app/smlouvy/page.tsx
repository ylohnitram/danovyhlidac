import type { Metadata } from "next"
import ContractsList from "@/components/contracts-list"

export const metadata: Metadata = {
  title: "Veřejné smlouvy | MůjDaňovýHlídač",
  description: "Procházejte a vyhledávejte veřejné smlouvy z Registru smluv",
}

export default function SmlouvyPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Veřejné smlouvy</h1>
      <p className="text-muted-foreground mb-8">
        Procházejte a vyhledávejte veřejné smlouvy z Registru smluv. Data jsou aktualizována denně.
      </p>

      <ContractsList />
    </main>
  )
}

