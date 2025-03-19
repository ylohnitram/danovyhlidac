"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft, ChevronRight } from "lucide-react"

// Mock data for top contractors
const TOP_CONTRACTORS = [
  { id: 1, name: "Metrostav a.s.", contracts: 156, totalAmount: 12500000000 },
  { id: 2, name: "Skanska a.s.", contracts: 142, totalAmount: 9800000000 },
  { id: 3, name: "Eurovia CS, a.s.", contracts: 128, totalAmount: 8700000000 },
  { id: 4, name: "STRABAG a.s.", contracts: 115, totalAmount: 7600000000 },
  { id: 5, name: "HOCHTIEF CZ a.s.", contracts: 98, totalAmount: 6200000000 },
  { id: 6, name: "OHL ŽS, a.s.", contracts: 87, totalAmount: 5400000000 },
  { id: 7, name: "VCES a.s.", contracts: 76, totalAmount: 4800000000 },
  { id: 8, name: "BAK stavební společnost, a.s.", contracts: 65, totalAmount: 3900000000 },
  { id: 9, name: "GEOSAN GROUP a.s.", contracts: 54, totalAmount: 3200000000 },
  { id: 10, name: "Chládek a Tintěra, a.s.", contracts: 43, totalAmount: 2800000000 },
  { id: 11, name: "COLAS CZ, a.s.", contracts: 39, totalAmount: 2500000000 },
  { id: 12, name: "M - SILNICE a.s.", contracts: 35, totalAmount: 2200000000 },
  { id: 13, name: "SWIETELSKY stavební s.r.o.", contracts: 32, totalAmount: 1900000000 },
  { id: 14, name: "PORR a.s.", contracts: 28, totalAmount: 1700000000 },
  { id: 15, name: "IMOS Brno, a.s.", contracts: 25, totalAmount: 1500000000 },
]

export default function TopContractors() {
  const [page, setPage] = useState(1)
  const pageSize = 5
  const totalPages = Math.ceil(TOP_CONTRACTORS.length / pageSize)

  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const currentPageData = TOP_CONTRACTORS.slice(startIndex, endIndex)

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Dodavatel</TableHead>
              <TableHead className="text-right">Počet zakázek</TableHead>
              <TableHead className="text-right">Celková částka</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentPageData.map((contractor, index) => (
              <TableRow key={contractor.id}>
                <TableCell className="font-medium">{startIndex + index + 1}</TableCell>
                <TableCell>{contractor.name}</TableCell>
                <TableCell className="text-right">{contractor.contracts}</TableCell>
                <TableCell className="text-right font-medium">
                  {(contractor.totalAmount / 1000000).toFixed(0)} mil. Kč
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end p-4 border-t">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Strana {page} z {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

