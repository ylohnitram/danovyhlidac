"use client"

import { AlertTriangle, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// Mock data for unusual contracts
const UNUSUAL_CONTRACTS = [
  {
    id: 1,
    title: "Firma s 1 zaměstnancem získala zakázku za 25M Kč",
    description:
      "Společnost XYZ s.r.o. založená před 3 měsíci s jediným zaměstnancem získala zakázku na dodávku IT služeb pro ministerstvo.",
    category: "IT služby",
    amount: 25000000,
    date: "15.2.2024",
    authority: "Ministerstvo financí",
    contractor: "XYZ s.r.o.",
    flags: ["nová firma", "malá firma", "velká částka"],
  },
  {
    id: 2,
    title: "Zakázka zadána bez výběrového řízení",
    description:
      "Městský úřad zadal zakázku na rekonstrukci náměstí bez řádného výběrového řízení s odvoláním na výjimku z důvodu časové tísně.",
    category: "Stavební práce",
    amount: 42000000,
    date: "3.3.2024",
    authority: "Město Kolín",
    contractor: "Stavby Kolín a.s.",
    flags: ["bez výběrového řízení", "časová tíseň"],
  },
  {
    id: 3,
    title: "Opakované dodatky navýšily cenu o 80%",
    description: "Původní zakázka na výstavbu sportovní haly za 50M Kč byla postupně navýšena dodatky na 90M Kč.",
    category: "Stavební práce",
    amount: 90000000,
    date: "10.1.2024",
    authority: "Kraj Vysočina",
    contractor: "SPORT-STAVBY s.r.o.",
    flags: ["dodatky", "navýšení ceny"],
  },
]

export default function UnusualContracts() {
  return (
    <div className="space-y-4">
      {UNUSUAL_CONTRACTS.map((contract) => (
        <Card key={contract.id} className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
              <div>
                <CardTitle className="text-base">{contract.title}</CardTitle>
                <CardDescription className="text-amber-700 mt-1">
                  {contract.date} • {contract.amount.toLocaleString("cs-CZ")} Kč
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <p className="text-sm text-amber-900">{contract.description}</p>
            <div className="flex flex-wrap gap-1 mt-3">
              {contract.flags.map((flag, index) => (
                <Badge key={index} variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                  {flag}
                </Badge>
              ))}
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-800 hover:text-amber-900 hover:bg-amber-100 p-0 h-auto"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              <span>Zobrazit detail v registru smluv</span>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

