import { type NextRequest, NextResponse } from "next/server"

// Mock data for contracts
const CONTRACTS = [
  {
    id: 1,
    name: "Rekonstrukce silnice I/35",
    amount: 125000000,
    category: "silnice",
    contractor: "Eurovia CS",
    contracting_authority: "ŘSD",
    lat: 50.0755,
    lng: 14.4378,
    year: 2023,
  },
  {
    id: 2,
    name: "Výstavba nové školky",
    amount: 45000000,
    category: "skolstvi",
    contractor: "Metrostav",
    contracting_authority: "Město Brno",
    lat: 49.1951,
    lng: 16.6068,
    year: 2022,
  },
  {
    id: 3,
    name: "Oprava kanalizace",
    amount: 18500000,
    category: "infrastruktura",
    contractor: "VHS",
    contracting_authority: "Město Olomouc",
    lat: 49.5938,
    lng: 17.2509,
    year: 2024,
  },
  // ... more contracts would be here in a real application
]

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Get filter parameters
  const city = searchParams.get("mesto")
  const category = searchParams.get("kategorie")
  const minAmount = searchParams.get("min_cena") ? Number.parseInt(searchParams.get("min_cena")!) : null
  const maxAmount = searchParams.get("max_cena") ? Number.parseInt(searchParams.get("max_cena")!) : null

  // Filter contracts based on parameters
  let filteredContracts = [...CONTRACTS]

  if (city) {
    // In a real app, we would filter by city or region
    // For now, we'll just return all contracts
  }

  if (category && category !== "all") {
    filteredContracts = filteredContracts.filter((contract) => contract.category === category)
  }

  if (minAmount !== null) {
    filteredContracts = filteredContracts.filter((contract) => contract.amount >= minAmount)
  }

  if (maxAmount !== null) {
    filteredContracts = filteredContracts.filter((contract) => contract.amount <= maxAmount)
  }

  // Return filtered contracts
  return NextResponse.json(filteredContracts)
}

