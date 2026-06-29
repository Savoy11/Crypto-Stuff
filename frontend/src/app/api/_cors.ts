import { NextResponse } from 'next/server'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handles preflight OPTIONS requests — re-export from every v1 route as `options`
export function options() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
