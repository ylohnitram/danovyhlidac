"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { fetchTopContractors } from "@/app/actions/contractor-stats"
import CacheStatusIndicator from "@/components/cache-status-indicator"

// Type for top contractor
interface TopContractor {
  name: string;
  contracts: number;
  totalAmount: number;
}

export default function TopContractors() {
  const [loading, setLoading] = useState(true);
  const [topContractors, setTopContractors] = useState<TopContractor[]>([]);
  const [isCached, setIsCached] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load contractors data
  const loadContractorsData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call the server action to fetch top contractors
      const result = await fetchTopContractors(10); // Get top 10
      
      if (result.success) {
        setTopContractors(result.data);
        setIsCached(result.cached || false);
      } else {
        setError(result.error || "Chyba při načítání dat");
        setTopContractors([]);
      }
    } catch (err) {
      console.error("Error loading top contractors:", err);
      setError("Nepodařilo se načíst data o top dodavatelích.");
      setTopContractors([]);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadContractorsData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    await loadContractorsData();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-6">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground py-4">
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Top 10 dodavatelů</CardTitle>
        <CacheStatusIndicator
          isCached={isCached}
          onRefresh={handleRefresh}
        />
      </CardHeader>
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
            {topContractors.length > 0 ? (
              topContractors.map((contractor, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{contractor.name}</TableCell>
                  <TableCell className="text-right">{contractor.contracts}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(contractor.totalAmount / 1000000).toFixed(0)} mil. Kč
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                  Žádní dodavatelé nebyli nalezeni
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
