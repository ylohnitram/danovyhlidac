import { Metadata } from "next"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ExternalLink } from "lucide-react"

export const metadata: Metadata = {
  title: "Database Setup | MůjDaňovýHlídač Admin",
  description: "Správa databáze pro aplikaci MůjDaňovýHlídač",
}

export default function DatabaseSetupPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Nastavení databáze</h1>
        
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Důležité upozornění</AlertTitle>
          <AlertDescription>
            Na stránce se vyskytuje problém s databázovým schématem. Tabulka &quot;smlouva&quot; 
            v databázi nebyla nalezena. Je potřeba provést inicializaci databáze pomocí migrací.
          </AlertDescription>
        </Alert>
        
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stav databáze</CardTitle>
              <CardDescription>
                Informace o aktuálním stavu databáze a jejím připojení
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Pro zjištění stavu databáze musíte spustit kontrolu. Tato akce ověří připojení 
                k databázi a existenci požadovaných tabulek.
              </p>
              
              <form action="/api/admin/db-check" className="space-y-4">
                <Button type="submit">
                  Zkontrolovat stav databáze
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Spustit migrace</CardTitle>
              <CardDescription>
                Inicializovat databázi a vytvořit potřebné tabulky
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Pokud databáze není inicializována, použijte toto tlačítko ke spuštění 
                všech migrací a vytvoření potřebných tabulek.
              </p>
              
              <form action="/api/admin/db-setup" className="space-y-4">
                <Button type="submit" variant="destructive">
                  Inicializovat databázi
                </Button>
              </form>
              
              <p className="text-sm text-muted-foreground mt-4">
                Tato akce je bezpečná, pokud databáze už existuje, nebudou provedeny žádné změny.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Nápověda k řešení problémů</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Chyba: &quot;relation &quot;smlouva&quot; does not exist&quot;</h3>
              <p className="text-muted-foreground mb-2">
                Tato chyba znamená, že databáze je dostupná, ale neobsahuje tabulku &quot;smlouva&quot;.
                Řešením je spustit migrace, které vytvoří potřebné tabulky.
              </p>
              <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                <li>Klikněte na tlačítko &quot;Inicializovat databázi&quot; výše</li>
                <li>Pokud to nefunguje, zkuste spustit migrace manuálně pomocí CLI</li>
                <li>Ujistěte se, že proměnná prostředí DATABASE_URL je správně nastavena</li>
              </ol>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Chyba připojení k databázi</h3>
              <p className="text-muted-foreground mb-2">
                Pokud se nelze připojit k databázi, zkontrolujte:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Správnost připojovacího řetězce v proměnné DATABASE_URL</li>
                <li>Dostupnost databázového serveru</li>
                <li>Nastavení firewallu a přístupová práva</li>
              </ul>
            </div>
            
            <div className="pt-2">
              <Button variant="outline" asChild>
                <a href="https://www.prisma.io/docs/getting-started/setup-prisma/add-to-existing-project" target="_blank" rel="noopener noreferrer" className="flex items-center">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Dokumentace Prisma
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
