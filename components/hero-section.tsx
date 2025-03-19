"use client"

import { ArrowDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HeroSection() {
  const scrollToCalculator = () => {
    const calculatorSection = document.getElementById("calculator")
    if (calculatorSection) {
      calculatorSection.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <div className="relative bg-blue-600 text-white">
      <div className="container mx-auto px-4 py-24 md:py-32">
        <div className="max-w-3xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Kolik z vašich daní jde na veřejné zakázky?
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-blue-100">Zjistěte, kdo utrácí vaše peníze ve vašem okolí</p>
          <Button
            size="lg"
            onClick={scrollToCalculator}
            className="bg-white text-blue-600 hover:bg-blue-50 flex items-center gap-2"
          >
            Spočítejte svůj příspěvek
            <ArrowDownIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
    </div>
  )
}

