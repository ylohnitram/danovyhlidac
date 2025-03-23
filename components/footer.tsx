"use client"

import Link from "next/link"
import { FileText, Mail, MapPin, Info, Shield, Heart } from "lucide-react"

export default function Footer() {
  // Dynamically get the current year
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="border-t bg-slate-50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Column 1: About */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">MůjDaňovýHlídač</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Váš pomocník pro sledování využití veřejných financí ve státní správě a samosprávě.
            </p>
            <div className="flex items-center">
              <Heart className="h-4 w-4 text-red-500 mr-1" />
              <span className="text-sm text-muted-foreground">
                Vytvořeno s láskou k transparentnosti
              </span>
            </div>
          </div>
          
          {/* Column 2: Quick links */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">Rychlé odkazy</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/smlouvy" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <FileText className="h-4 w-4 mr-2" />
                  Procházet smlouvy
                </Link>
              </li>
              <li>
                <Link href="/mesta" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Města a zadavatelé
                </Link>
              </li>
              <li>
                <Link href="/#calculator" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  Daňový kalkulátor
                </Link>
              </li>
            </ul>
          </div>
          
          {/* Column 3: Legal & Info */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">Informace</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/o-projektu" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  O projektu
                </Link>
              </li>
              <li>
                <Link href="/gdpr" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Ochrana osobních údajů
                </Link>
              </li>
              <li>
                <Link href="/kontakt" className="text-sm text-muted-foreground hover:text-blue-600 flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  Kontakt
                </Link>
              </li>
            </ul>
          </div>
          
          {/* Column 4: Data sources */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">Zdroje dat</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Data jsou čerpána z veřejně dostupných zdrojů:
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Registr smluv ČR</li>
              <li>• Profily zadavatelů</li>
              <li>• Úřední desky měst a obcí</li>
            </ul>
          </div>
        </div>
        
        {/* Copyright section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground">
              &copy; {currentYear} MůjDaňovýHlídač - Všechna práva vyhrazena.
            </p>
            <p className="text-sm text-muted-foreground mt-2 md:mt-0">
              Veškerá data jsou získávána z veřejných zdrojů.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
