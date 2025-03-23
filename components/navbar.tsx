"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MapPin, Home, FileText, Calculator, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

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
  
  return (
    <nav className="bg-white shadow-sm border-b">
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
            {/* Mobile menu button */}
            <button className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100">
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
