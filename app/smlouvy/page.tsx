import type { Metadata } from "next"
import { Suspense } from "react"
import ContractsList from "@/components/contracts-list"
import { Loader2 } from "lucide-react"

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

      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        <ContractsList />
      </Suspense>
    </main>
  )
}
