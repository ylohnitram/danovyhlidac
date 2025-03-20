"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import MarkerClusterGroup from "react-leaflet-cluster"
import { Icon } from "leaflet"
import { Loader2 } from "lucide-react"
import dynamic from "next/dynamic"

import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import MapWrapper from "./map-wrapper" // Import the wrapper component

// Import Leaflet CSS
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"

// Mock data for contracts
const MOCK_CONTRACTS = [
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
  {
    id: 4,
    name: "Kulturní centrum",
    amount: 78000000,
    category: "kultura",
    contractor: "Skanska",
    contracting_authority: "Město Plzeň",
    lat: 49.7384,
    lng: 13.3736,
    year: 2023,
  },
  {
    id: 5,
    name: "Revitalizace parku",
    amount: 12000000,
    category: "zelen",
    contractor: "Zahrada s.r.o.",
    contracting_authority: "Město Liberec",
    lat: 50.7663,
    lng: 15.0543,
    year: 2022,
  },
  {
    id: 6,
    name: "Nový pavilon nemocnice",
    amount: 230000000,
    category: "zdravotnictvi",
    contractor: "VCES",
    contracting_authority: "Kraj Vysočina",
    lat: 49.3961,
    lng: 15.5903,
    year: 2024,
  },
  {
    id: 7,
    name: "Cyklostezka",
    amount: 8500000,
    category: "doprava",
    contractor: "Strabag",
    contracting_authority: "Město Ostrava",
    lat: 49.8209,
    lng: 18.2625,
    year: 2023,
  },
  {
    id: 8,
    name: "Modernizace čistírny vod",
    amount: 95000000,
    category: "infrastruktura",
    contractor: "Hochtief",
    contracting_authority: "Město Hradec Králové",
    lat: 50.2092,
    lng: 15.8328,
    year: 2022,
  },
  {
    id: 9,
    name: "Sportovní hala",
    amount: 65000000,
    category: "sport",
    contractor: "BAK",
    contracting_authority: "Město Pardubice",
    lat: 50.0343,
    lng: 15.7812,
    year: 2024,
  },
  {
    id: 10,
    name: "Rekonstrukce náměstí",
    amount: 42000000,
    category: "verejny-prostor",
    contractor: "OHL ŽS",
    contracting_authority: "Město České Budějovice",
    lat: 48.9747,
    lng: 14.4746,
    year: 2023,
  },
]

const CATEGORIES = [
  { id: "all", name: "Všechny kategorie" },
  { id: "silnice", name: "Silnice a doprava" },
  { id: "skolstvi", name: "Školství" },
  { id: "zdravotnictvi", name: "Zdravotnictví" },
  { id: "kultura", name: "Kultura" },
  { id: "infrastruktura", name: "Infrastruktura" },
  { id: "sport", name: "Sport" },
  { id: "verejny-prostor", name: "Veřejný prostor" },
  { id: "zelen", name: "Zeleň a parky" },
]

const YEARS = [2020, 2021, 2022, 2023, 2024]

// Custom icon for markers
const customIcon = new Icon({
  iconUrl: "https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Form for reporting suspicious contracts
function ReportForm({ contractId, contractName }: { contractId: number; contractName: string }) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false)
      toast({
        title: "Podnět byl odeslán",
        description: "Děkujeme za váš podnět. Budeme se jím zabývat.",
      })

      // Reset form
      const form = e.target as HTMLFormElement
      form.reset()
    }, 1500)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="contractId" value={contractId} />

      <div className="space-y-2">
        <Label htmlFor="name">Jméno a příjmení</Label>
        <Input id="name" name="name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Zpráva</Label>
        <Textarea
          id="message"
          name="message"
          placeholder={`Popište, proč považujete zakázku "${contractName}" za podezřelou...`}
          required
          rows={4}
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Odesílám...
            </>
          ) : (
            "Odeslat podnět"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}

// Map component with dynamic import to avoid SSR issues
const ContractsMapComponent = () => {
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState(MOCK_CONTRACTS)
  const [filters, setFilters] = useState({
    category: "all",
    amountRange: [0, 250000000] as [number, number],
    year: 0,
  })

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      setLoading(false)
    }, 1000)
  }, [])

  useEffect(() => {
    // Filter contracts based on selected filters
    let filtered = MOCK_CONTRACTS

    if (filters.category !== "all") {
      filtered = filtered.filter((contract) => contract.category === filters.category)
    }

    filtered = filtered.filter(
      (contract) => contract.amount >= filters.amountRange[0] && contract.amount <= filters.amountRange[1],
    )

    if (filters.year > 0) {
      filtered = filtered.filter((contract) => contract.year === filters.year)
    }

    setContracts(filtered)
  }, [filters])

  const handleCategoryChange = (value: string) => {
    setFilters((prev) => ({ ...prev, category: value }))
  }

  const handleAmountChange = (value: [number, number]) => {
    setFilters((prev) => ({ ...prev, amountRange: value }))
  }

  const handleYearChange = (value: string) => {
    setFilters((prev) => ({ ...prev, year: Number.parseInt(value) }))
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Kategorie</Label>
              <Select onValueChange={handleCategoryChange} defaultValue={filters.category}>
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte kategorii" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Rozsah částky (mil. Kč)</Label>
              <div className="pt-6">
                <Slider
                  defaultValue={[0, 250]}
                  max={250}
                  step={1}
                  onValueChange={(values) => handleAmountChange([values[0] * 1000000, values[1] * 1000000])}
                />
                <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                  <span>0</span>
                  <span>250 mil.</span>
                </div>
              </div>
            </div>

            <div>
              <Label>Rok</Label>
              <Select onValueChange={handleYearChange} defaultValue="0">
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte rok" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Všechny roky</SelectItem>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <MapWrapper>
        <div className="h-[500px] rounded-lg overflow-hidden border map-container">
          <MapContainer center={[49.8, 15.5]} zoom={7} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MarkerClusterGroup>
              {contracts.map((contract) => (
                <Marker key={contract.id} position={[contract.lat, contract.lng]} icon={customIcon}>
                  <Popup>
                    <div className="space-y-2 p-1">
                      <h3 className="font-semibold">{contract.name}</h3>
                      <p className="text-sm">
                        <strong>Částka:</strong> {contract.amount.toLocaleString("cs-CZ")} Kč
                      </p>
                      <p className="text-sm">
                        <strong>Dodavatel:</strong> {contract.contractor}
                      </p>
                      <p className="text-sm">
                        <strong>Zadavatel:</strong> {contract.contracting_authority}
                      </p>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="w-full mt-2">
                            Podat podnět
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Podat podnět k zakázce</DialogTitle>
                            <DialogDescription>
                              Pokud se vám tato zakázka zdá podezřelá, můžete podat podnět k prošetření.
                            </DialogDescription>
                          </DialogHeader>
                          <ReportForm contractId={contract.id} contractName={contract.name} />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        </div>
      </MapWrapper>

      <div className="text-sm text-muted-foreground text-center">
        Zobrazeno {contracts.length} z {MOCK_CONTRACTS.length} zakázek
      </div>
    </div>
  )
}

// Wrap the map component with dynamic import to avoid SSR issues
export default dynamic(() => Promise.resolve(ContractsMapComponent), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center h-64 border rounded-lg">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  ),
})
