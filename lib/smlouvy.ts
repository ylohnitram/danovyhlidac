import prisma from "./db"

// Function to fetch contracts with filtering
export async function getSmlouvy({
  mesto,
  kategorie,
  minCena,
  maxCena,
  rok,
  limit = 100,
  offset = 0,
}: {
  mesto?: string
  kategorie?: string
  minCena?: number
  maxCena?: number
  rok?: number
  limit?: number
  offset?: number
}) {
  try {
    // Build the filter object
    const filter: any = {}

    if (kategorie && kategorie !== "all") {
      filter.kategorie = kategorie
    }

    if (rok) {
      filter.datum = {
        gte: new Date(`${rok}-01-01`),
        lt: new Date(`${rok + 1}-01-01`),
      }
    }

    // Price filter
    if (minCena || maxCena) {
      filter.castka = {}

      if (minCena) {
        filter.castka.gte = minCena
      }

      if (maxCena) {
        filter.castka.lte = maxCena
      }
    }

    // City filter - in a real app, this would be more complex
    // For example, it might filter by the city of the contracting authority
    if (mesto) {
      filter.zadavatel = {
        contains: mesto,
      }
    }

    // Execute the query
    const smlouvy = await prisma.smlouva.findMany({
      where: filter,
      take: limit,
      skip: offset,
      orderBy: {
        datum: "desc",
      },
    })

    const total = await prisma.smlouva.count({
      where: filter,
    })

    return {
      data: smlouvy,
      total,
      limit,
      offset,
    }
  } catch (error) {
    console.error("Error fetching contracts:", error)
    throw new Error("Failed to fetch contracts")
  }
}

// Function to get a single contract by ID
export async function getSmlouvaById(id: number) {
  try {
    const smlouva = await prisma.smlouva.findUnique({
      where: {
        id,
      },
    })

    return smlouva
  } catch (error) {
    console.error(`Error fetching contract with ID ${id}:`, error)
    throw new Error("Failed to fetch contract")
  }
}

// Function to create a new report (podnět)
export async function createPodnet({
  jmeno,
  email,
  smlouvaId,
  zprava,
}: {
  jmeno: string
  email: string
  smlouvaId: number
  zprava: string
}) {
  try {
    const podnet = await prisma.podnet.create({
      data: {
        jmeno,
        email,
        smlouvaId,
        zprava,
      },
    })

    return podnet
  } catch (error) {
    console.error("Error creating report:", error)
    throw new Error("Failed to create report")
  }
}

