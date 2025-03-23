import type { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, ArrowRight, FileBarChart, BookOpen } from "lucide-react"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { fetchCategoryStats } from "@/app/actions/category-stats"

// Define metadata
export const metadata: Metadata = {
  title: "Kategorie zakázek | MůjDaňovýHlídač",
  description: "Prozkoumejte veřejné zakázky a smlouvy podle jednotlivých kategorií. Přehled zakázek v oblasti dopravy, školství, zdravotnictví a dalších oblastech.",
}

// Icon mapping
const CATEGORY_ICONS: Record<string, any> = {
  "verejne-zakazky": FileText,
  "dotace": FileBarChart,
  "prodej-majetku": FileText,
  "najem": FileText,
  "ostatni": FileText,
  "silnice": FileText,
  "skolstvi": BookOpen,
  "zdravotnictvi": FileText,
  "kultura": FileText,
  "sport": FileText,
  "default": FileText
};

export default function CategoriesPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Veřejné zakázky podle kategorií</h1>
      <p className="text-muted-foreground mb-8">
        Prozkoumejte veřejné zakázky a smlouvy podle jednotlivých kategorií. 
        Vyberte kategorii ze seznamu pro detailní přehled veřejných zakázek.
      </p>
      
      <Suspense fallback={
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        {/* @ts-expect-error Async Server Component */}
        <CategoryListContent />
      </Suspense>
      
      <div className="mt-12 bg-blue-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <FileBarChart className="h-5 w-5 text-blue-600 mr-2" />
          Proč sledovat zakázky podle kategorií?
        </h2>
        <p className="mb-4">
          Rozdělení veřejných zakázek podle kategorií umožňuje lépe pochopit, kam směřují veřejné
          finance v různých oblastech. Můžete tak snadno zjistit, kolik prostředků je vynakládáno
          například na dopravní infrastrukturu, školství nebo zdravotnictví.
        </p>
        <p>
          Vyberte kategorii, která vás zajímá, a získejte přehled o aktuálních i historických
          zakázkách v dané oblasti. Sledujte trendy, hodnoty zakázek a hlavní dodavatele.
        </p>
      </div>
    </main>
  );
}

// The content component that awaits the data
async function CategoryListContent() {
  // Fetch category stats from the database
  const categoryStats = await fetchCategoryStats();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {categoryStats.map((category) => {
        // Select the appropriate icon, defaulting to FileText if not found
        const Icon = CATEGORY_ICONS[category.id] || CATEGORY_ICONS["default"];
        
        return (
          <Card key={category.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start">
                <Icon className="h-5 w-5 text-blue-600 mr-3 mt-1 flex-shrink-0" />
                <div className="flex-grow">
                  <h2 className="text-xl font-semibold mb-2">{category.name}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {category.description}
                  </p>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-muted-foreground">
                      Počet zakázek:
                    </span>
                    <span className="font-medium">
                      {category.contractsCount.toLocaleString('cs-CZ')}
                    </span>
                  </div>
                  <Button asChild>
                    <Link href={`/kategorie/${category.id}`} className="w-full flex items-center justify-center">
                      Prozkoumat kategorii
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
