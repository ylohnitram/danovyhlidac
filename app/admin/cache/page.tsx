import type { Metadata } from "next"
import CacheDashboard from "@/components/admin/cache-dashboard"

export const metadata: Metadata = {
  title: "Cache Dashboard | MůjDaňovýHlídač Admin",
  description: "Správa cache pro aplikaci MůjDaňovýHlídač",
}

export default function CacheDashboardPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <CacheDashboard />
    </main>
  )
}

