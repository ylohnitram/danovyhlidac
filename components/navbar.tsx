"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { MapPin, Home, FileText, Calculator, BarChart3, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navItems = [
  {
    name: "Domů",
    href: "/",
    icon: Home
  },
  {
    name: "Smlouvy",
    href: "/smlouvy",
    icon: FileText
  },
  {
    name: "Města",
    href: "/mesta",
    icon: MapPin
  },
  {
    name: "Kategorie",
    href: "/kategorie",
    icon: BarChart3
  },
  {
    name: "Kalkulačka",
    href: "/#calculator",
    icon: Calculator
  }
]

export default function Navbar() {
  const pathname = usePathname()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  
  // Track scroll position to apply visual effects
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }
    
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])
  
  // Handle mobile navigation click
  const handleMobileNavClick = (href: string) => {
    router.push(href)
    setIsMobileMenuOpen(false)
  }
  
  return (
    <header className={cn(
      "sticky top-0 z-50 w-full transition-all duration-200",
      isScrolled 
        ? "bg-white/95 backdrop-blur-sm shadow-md" 
        : "bg-white border-b"
    )}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 flex items-center">
              <span className="text-blue-600 font-bold text-xl">MůjDaňovýHlídač</span>
            </Link>
          </div>
          
          <div className="hidden md:block">
            <div className="flex items-center space-x-4">
              {navItems.map((item) => {
                const isActive = 
                  pathname === item.href || 
                  (item.href !== "/" && pathname?.startsWith(item.href));
                
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="h-4 w-4 mr-1.5" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
          
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Otevřít menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <div className="flex flex-col space-y-3 mt-8">
                  {navItems.map((item) => {
                    const isActive = 
                      pathname === item.href || 
                      (item.href !== "/" && pathname?.startsWith(item.href));
                    
                    const Icon = item.icon;
                    
                    return (
                      <button
                        key={item.name}
                        onClick={() => handleMobileNavClick(item.href)}
                        className={cn(
                          "flex items-center px-4 py-3 rounded-md text-left font-medium transition-colors",
                          isActive
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        <Icon className="h-5 w-5 mr-3" />
                        {item.name}
                      </button>
                    )
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
