"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { motion, AnimatePresence } from "framer-motion"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2, Home, Building, Landmark, Users, Calculator } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"

// Define the schema for the form
const formSchema = z.object({
  // Step 1: Personal Information
  city: z.string({
    required_error: "Vyberte město bydliště",
  }),
  income: z.coerce
    .number({
      required_error: "Zadejte roční příjem",
      invalid_type_error: "Zadejte platné číslo",
    })
    .min(1, {
      message: "Příjem musí být kladné číslo",
    }),

  // Step 2: Property Information
  propertyType: z.enum(["apartment", "house", "land"], {
    required_error: "Vyberte typ nemovitosti",
  }),
  propertyValue: z.coerce
    .number({
      required_error: "Zadejte hodnotu nemovitosti",
      invalid_type_error: "Zadejte platné číslo",
    })
    .min(1, {
      message: "Hodnota musí být kladné číslo",
    })
    .optional(),

  // Step 3: Additional Information
  dependents: z.coerce.number().min(0).default(0),
  hasCarAbove3500cc: z.boolean().default(false),
  hasSolarPanels: z.boolean().default(false),
})

// Define the type for the form
type TaxFormValues = z.infer<typeof formSchema>

// Cities data
const CITIES = [
  { id: "praha", name: "Praha" },
  { id: "brno", name: "Brno" },
  { id: "ostrava", name: "Ostrava" },
  { id: "plzen", name: "Plzeň" },
  { id: "liberec", name: "Liberec" },
  { id: "olomouc", name: "Olomouc" },
  { id: "ceske-budejovice", name: "České Budějovice" },
  { id: "hradec-kralove", name: "Hradec Králové" },
  { id: "usti-nad-labem", name: "Ústí nad Labem" },
  { id: "pardubice", name: "Pardubice" },
]

// Colors for the chart
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"]

// Animation variants for the steps
const stepVariants = {
  hidden: {
    opacity: 0,
    x: 50,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
    },
  },
  exit: {
    opacity: 0,
    x: -50,
    transition: {
      duration: 0.3,
    },
  },
}

// Animation variants for the result
const resultVariants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      delay: 0.2,
    },
  },
}

// Step indicator component
function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="mb-8">
      <div className="flex justify-between mb-2">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={`flex items-center justify-center w-8 h-8 rounded-full ${
              index < currentStep
                ? "bg-blue-600 text-white"
                : index === currentStep
                  ? "bg-blue-100 border-2 border-blue-600 text-blue-600"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {index < currentStep ? <CheckCircle2 className="w-5 h-5" /> : <span>{index + 1}</span>}
          </div>
        ))}
      </div>
      <Progress value={(currentStep / (totalSteps - 1)) * 100} className="h-2" />
    </div>
  )
}

export default function TaxCalculator() {
  // State for the current step
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = 4 // Including the result step

  // State for calculation
  const [calculating, setCalculating] = useState(false)
  const [calculationProgress, setCalculationProgress] = useState(0)
  const [result, setResult] = useState<null | {
    totalContribution: number
    breakdown: Array<{ name: string; value: number }>
    taxRate: number
    publicContractsPercentage: number
    cityMultiplier: number
  }>(null)

  // Initialize the form
  const form = useForm<TaxFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      income: undefined,
      propertyType: "apartment",
      propertyValue: undefined,
      dependents: 0,
      hasCarAbove3500cc: false,
      hasSolarPanels: false,
    },
  })

  // Get form values
  const formValues = form.watch()

  // Handle next step
  const handleNextStep = async () => {
    // Validate the current step
    let isValid = false

    if (currentStep === 0) {
      // Validate step 1 fields
      isValid = await form.trigger(["city", "income"])
    } else if (currentStep === 1) {
      // Validate step 2 fields
      isValid = await form.trigger(["propertyType"])
    } else if (currentStep === 2) {
      // Validate step 3 fields (or submit)
      isValid = true
    }

    if (isValid) {
      if (currentStep < totalSteps - 2) {
        // Go to next step
        setCurrentStep((prev) => prev + 1)
      } else {
        // Submit the form
        handleCalculate()
      }
    }
  }

  // Handle previous step
  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  // Handle calculation
  const handleCalculate = () => {
    setCalculating(true)
    setCalculationProgress(0)
    setCurrentStep(totalSteps - 1) // Move to result step

    // Simulate calculation progress
    const interval = setInterval(() => {
      setCalculationProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 5
      })
    }, 100)

    // Simulate API call with delay
    setTimeout(() => {
      clearInterval(interval)
      setCalculationProgress(100)

      // Get form values
      const values = form.getValues()

      // Calculate tax contribution based on form values
      const taxRate = 0.15 // 15% tax rate
      const publicContractsPercentage = 0.32 // 32% of taxes go to public contracts

      // City multiplier (different cities have different tax rates)
      let cityMultiplier = 1.0
      switch (values.city) {
        case "praha":
          cityMultiplier = 1.2
          break
        case "brno":
          cityMultiplier = 1.1
          break
        case "ostrava":
          cityMultiplier = 0.9
          break
        default:
          cityMultiplier = 1.0
      }

      // Property type modifier
      let propertyModifier = 1.0
      switch (values.propertyType) {
        case "apartment":
          propertyModifier = 1.0
          break
        case "house":
          propertyModifier = 1.2
          break
        case "land":
          propertyModifier = 0.8
          break
      }

      // Dependents discount
      const dependentsDiscount = values.dependents * 0.05

      // Calculate total tax
      let totalTax = values.income * taxRate * cityMultiplier * propertyModifier

      // Apply dependents discount (max 15%)
      totalTax = totalTax * (1 - Math.min(dependentsDiscount, 0.15))

      // Calculate contribution to public contracts
      const totalContribution = totalTax * publicContractsPercentage

      // Calculate breakdown
      const breakdown = [
        { name: "Silnice a doprava", value: totalContribution * 0.35 },
        { name: "Školství", value: totalContribution * 0.25 },
        { name: "Zdravotnictví", value: totalContribution * 0.2 },
        { name: "Kultura", value: totalContribution * 0.1 },
        { name: "Ostatní", value: totalContribution * 0.1 },
      ]

      // Set result
      setResult({
        totalContribution,
        breakdown,
        taxRate,
        publicContractsPercentage,
        cityMultiplier,
      })

      setCalculating(false)
    }, 2000)
  }

  // Reset the form and go back to step 1
  const handleReset = () => {
    form.reset()
    setCurrentStep(0)
    setResult(null)
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Step indicator */}
      <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <Form {...form}>
            <form>
              <AnimatePresence mode="wait">
                {/* Step 1: Personal Information */}
                {currentStep === 0 && (
                  <motion.div
                    key="step1"
                    variants={stepVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <Users className="h-6 w-6 text-blue-600" />
                      <h2 className="text-2xl font-semibold">Osobní údaje</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Město bydliště</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Vyberte město" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CITIES.map((city) => (
                                <SelectItem key={city.id} value={city.id}>
                                  {city.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Město, kde máte trvalé bydliště</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="income"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Roční příjem (Kč)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Např. 480000" {...field} />
                          </FormControl>
                          <FormDescription>Váš hrubý roční příjem</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}

                {/* Step 2: Property Information */}
                {currentStep === 1 && (
                  <motion.div
                    key="step2"
                    variants={stepVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <Home className="h-6 w-6 text-blue-600" />
                      <h2 className="text-2xl font-semibold">Informace o nemovitosti</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="propertyType"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel>Typ nemovitosti</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              className="flex flex-col space-y-1"
                            >
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="apartment" />
                                </FormControl>
                                <FormLabel className="font-normal flex items-center">
                                  <Building className="h-4 w-4 mr-2 text-blue-600" />
                                  Byt
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="house" />
                                </FormControl>
                                <FormLabel className="font-normal flex items-center">
                                  <Home className="h-4 w-4 mr-2 text-blue-600" />
                                  Dům
                                </FormLabel>
                              </FormItem>
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <RadioGroupItem value="land" />
                                </FormControl>
                                <FormLabel className="font-normal flex items-center">
                                  <Landmark className="h-4 w-4 mr-2 text-blue-600" />
                                  Pozemek
                                </FormLabel>
                              </FormItem>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="propertyValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hodnota nemovitosti (Kč)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Např. 3500000"
                              {...field}
                              onChange={(e) => {
                                const value = e.target.value === "" ? undefined : Number(e.target.value)
                                field.onChange(value)
                              }}
                              value={field.value === undefined ? "" : field.value}
                            />
                          </FormControl>
                          <FormDescription>Odhadovaná tržní hodnota vaší nemovitosti</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </motion.div>
                )}

                {/* Step 3: Additional Information */}
                {currentStep === 2 && (
                  <motion.div
                    key="step3"
                    variants={stepVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <Calculator className="h-6 w-6 text-blue-600" />
                      <h2 className="text-2xl font-semibold">Doplňující informace</h2>
                    </div>

                    <FormField
                      control={form.control}
                      name="dependents"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Počet vyživovaných osob</FormLabel>
                          <div className="flex items-center space-x-4">
                            <FormControl>
                              <Input type="number" min={0} {...field} className="w-20" />
                            </FormControl>
                            <Slider
                              min={0}
                              max={5}
                              step={1}
                              value={[field.value]}
                              onValueChange={(values) => field.onChange(values[0])}
                              className="w-full max-w-xs"
                            />
                          </div>
                          <FormDescription>Počet dětí a dalších vyživovaných osob</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 pt-4">
                      <h3 className="text-lg font-medium">Další faktory</h3>
                      <p className="text-sm text-muted-foreground">
                        Tyto faktory mohou ovlivnit výši vašich daní a příspěvků na veřejné zakázky.
                      </p>

                      <Tabs defaultValue="standard">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="standard">Standardní</TabsTrigger>
                          <TabsTrigger value="advanced">Pokročilé</TabsTrigger>
                        </TabsList>
                        <TabsContent value="standard" className="space-y-4 pt-4">
                          <p className="text-sm text-muted-foreground">
                            Standardní výpočet používá základní parametry pro odhad vašeho příspěvku.
                          </p>
                        </TabsContent>
                        <TabsContent value="advanced" className="space-y-4 pt-4">
                          <FormField
                            control={form.control}
                            name="hasCarAbove3500cc"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="h-4 w-4 mt-1"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Vlastním automobil s objemem motoru nad 3500 ccm</FormLabel>
                                  <FormDescription>
                                    Automobily s velkým objemem motoru podléhají vyšší silniční dani.
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="hasSolarPanels"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="h-4 w-4 mt-1"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Mám instalované solární panely</FormLabel>
                                  <FormDescription>
                                    Solární panely mohou snížit vaši daňovou zátěž díky ekologickým odpočtům.
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Results */}
                {currentStep === 3 && (
                  <motion.div
                    key="step4"
                    variants={stepVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <CheckCircle2 className="h-6 w-6 text-blue-600" />
                      <h2 className="text-2xl font-semibold">Výsledky výpočtu</h2>
                    </div>

                    {calculating ? (
                      <div className="space-y-4 py-8">
                        <div className="flex justify-center">
                          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
                        </div>
                        <Progress value={calculationProgress} className="h-2" />
                        <p className="text-center text-muted-foreground">
                          Probíhá výpočet vašeho příspěvku na veřejné zakázky...
                        </p>
                      </div>
                    ) : result ? (
                      <motion.div variants={resultVariants} initial="hidden" animate="visible" className="space-y-8">
                        <div className="text-center">
                          <h3 className="text-lg font-medium">Váš roční příspěvek na veřejné zakázky</h3>
                          <p className="text-4xl font-bold text-blue-600 mt-2">
                            {formatCurrency(result.totalContribution)}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            To je přibližně {formatCurrency(result.totalContribution / 12)} měsíčně
                          </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-medium mb-2">Rozložení příspěvku</h4>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={result.breakdown}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                    nameKey="name"
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                  >
                                    {result.breakdown.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="font-medium mb-2">Detaily výpočtu</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Roční příjem:</span>
                                <span className="font-medium">{formatCurrency(formValues.income || 0)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Základní daňová sazba:</span>
                                <span className="font-medium">{(result.taxRate * 100).toFixed(0)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Koeficient města:</span>
                                <span className="font-medium">{result.cityMultiplier.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Podíl na veřejné zakázky:</span>
                                <span className="font-medium">
                                  {(result.publicContractsPercentage * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-2 mt-2">
                                <span className="font-medium">Celkový příspěvek:</span>
                                <span className="font-bold text-blue-600">
                                  {formatCurrency(result.totalContribution)}
                                </span>
                              </div>
                            </div>

                            <div className="pt-4">
                              <p className="text-sm text-muted-foreground">
                                Tento výpočet je pouze orientační a slouží pro představu o tom, jak jsou vaše daně
                                využívány na veřejné zakázky.
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Něco se pokazilo. Zkuste prosím výpočet znovu.</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation buttons */}
              <div className="flex justify-between mt-8">
                {currentStep > 0 ? (
                  <Button type="button" variant="outline" onClick={handlePrevStep} disabled={calculating}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Zpět
                  </Button>
                ) : (
                  <div></div> // Empty div to maintain layout
                )}

                {currentStep < totalSteps - 1 ? (
                  <Button type="button" onClick={handleNextStep} disabled={calculating}>
                    {currentStep === totalSteps - 2 ? "Vypočítat" : "Další"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleReset} variant="outline" disabled={calculating}>
                    Nový výpočet
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

