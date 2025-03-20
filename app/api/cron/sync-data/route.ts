import { NextResponse } from 'next/server'
import { syncData } from '@/scripts/sync-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // maximální doba běhu 1 minuta

export async function GET(request: Request) {
  try {
    // Ověření pomocí authorization hlavičky
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    // Ověření, že požadavek přichází z Vercelu nebo má správný token
    const isVercelCron = request.headers.get('x-vercel-cron') === '1'
    
    if (!isVercelCron && token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Spustíme synchronizaci
    const result = await syncData()
    
    return NextResponse.json({ 
      success: true, 
      message: 'Data synchronized successfully',
      result,
      timestamp: new Date().toISOString() 
    })
  } catch (error) {
    console.error('Error during cron job execution:', error)
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    }, { status: 500 })
  }
}
