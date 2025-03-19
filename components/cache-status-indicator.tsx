"use client"

import { useState, useEffect } from "react"
import { Clock, RefreshCw, Loader2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface CacheStatusIndicatorProps {
  isCached?: boolean
  onRefresh?: () => Promise<void>
  className?: string
}

export default function CacheStatusIndicator({
  isCached = false,
  onRefresh,
  className = "",
}: CacheStatusIndicatorProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    // Update the last updated time when the component mounts or when isCached changes
    if (!isCached) {
      setLastUpdated(new Date())
    }
  }, [isCached])

  const handleRefresh = async () => {
    if (!onRefresh) return

    setRefreshing(true)
    try {
      await onRefresh()
      setLastUpdated(new Date())
    } catch (error) {
      console.error("Error refreshing data:", error)
    } finally {
      setRefreshing(false)
    }
  }

  // Format the time difference
  const getTimeSince = () => {
    const now = new Date()
    const diffMs = now.getTime() - lastUpdated.getTime()
    const diffSec = Math.floor(diffMs / 1000)

    if (diffSec < 60) {
      return `${diffSec} s`
    } else if (diffSec < 3600) {
      return `${Math.floor(diffSec / 60)} min`
    } else if (diffSec < 86400) {
      return `${Math.floor(diffSec / 3600)} h`
    } else {
      return `${Math.floor(diffSec / 86400)} d`
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isCached ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Clock className="h-3 w-3" />
                <span>Cached ({getTimeSince()})</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Data jsou načtena z mezipaměti pro rychlejší odezvu.</p>
              {onRefresh && <p>Klikněte na tlačítko Obnovit pro aktuální data.</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
                <span>Aktuální</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Data jsou aktuální, načtena přímo z API.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {onRefresh && (
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 px-2">
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      )}
    </div>
  )
}

