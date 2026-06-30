// Static price-history reference data.
//
// Legitimate, non-fabricated reference facts used to annotate live price charts:
// the candle/range types, each asset's mainnet/launch date, and notable market
// stress events. Actual price candles are sourced live (see /live-data/ohlcv and
// fetchLiveChart); this file contains NO fabricated price series.

export interface PriceCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number // USD millions
}

export type PriceRange = '1W' | '1M' | '3M' | '1Y' | 'MAX'

// Stablecoin / token launch dates.
const LAUNCH_DATES: Record<string, string> = {
  usdt:  '2014-10-03',
  usdc:  '2018-10-15',
  dai:   '2019-12-18',
  frax:  '2020-12-20',
  tusd:  '2018-03-05',
  busd:  '2019-09-10',
  pyusd: '2023-08-07',
  usdp:  '2018-09-10',
  gusd:  '2018-09-10',
  lusd:  '2021-04-05',
  usde:          '2023-11-01',
  usd1:          '2025-03-01',
  usdg:          '2024-08-01',
  rlusd:         '2024-12-17',
  usdd:          '2022-06-05',
  'united-stable': '2024-06-01',
  eurc:          '2023-06-15',
  fdusd:         '2023-07-01',
  usdy:          '2023-08-03',
  usdf:          '2024-03-01',
  gho:           '2023-07-15',
  usd0:          '2023-10-01',
  usdai:         '2024-01-01',
  usdgo:         '2024-02-01',
  usat:          '2024-05-01',
  eurcv:         '2023-12-01',
  ausd:          '2024-04-01',
  frxusd:        '2024-10-01',
  dusd:          '2024-01-01',
  lisusd:        '2023-08-01',
  usdsui:        '2023-09-01',
  fidd:          '2024-07-01',
  vbusd:         '2022-01-01',
  euri:          '2023-04-01',
  usdh:          '2022-05-01',
  xusd:          '2022-01-01',
  yusd:          '2023-11-01',
  cusd:          '2020-09-14',
  ampl:          '2019-07-29',
  aeur:          '2022-03-01',
  musd:          '2025-02-01',
  tgbp:          '2018-03-05',
  usdk:          '2019-12-01',
  xsgd:          '2020-09-15',
  usdb:          '2024-03-01',
  usdcv:         '2023-12-01',
  usdm:          '2023-06-01',
  wusd:          '2024-01-01',
}

// Layer-1 / major asset launch dates.
const L1_LAUNCH_DATES: Record<string, string> = {
  btc: '2013-01-01', eth: '2015-08-07', sol: '2020-03-25',
  bnb: '2017-09-01', avax: '2020-09-23', ada: '2017-10-02',
  dot: '2020-08-19', pol: '2019-04-28',
  trx: '2018-09-01', hype: '2024-11-29', zec: '2016-10-28',
  xmr: '2014-04-18', cc: '2023-07-01', ton: '2020-11-15',
  bch: '2017-08-01', memecore: '2024-05-01', hbar: '2019-09-16',
  ltc: '2011-10-07', sui: '2023-05-03', cro: '2018-12-01',
  near: '2020-10-13', tao: '2021-11-01', pi: '2023-02-20',
  icp: '2021-05-10', etc: '2016-07-20', kas: '2022-11-07',
  stable: '2023-01-01', algo: '2019-06-20', flr: '2023-01-10',
  xdc: '2019-06-01', fil: '2020-10-15', apt: '2022-10-12',
  inj: '2021-10-21', vet: '2018-07-30', sei: '2023-08-15',
  kite: '2024-01-01', tia: '2023-10-31', chz: '2019-09-18',
  gno: '2017-04-24', xtz: '2018-09-17', mon: '2025-04-01',
  tel: '2018-01-01', kaia: '2019-06-27', cfx: '2021-01-29',
  iota: '2017-06-13', dcr: '2016-02-08', nex: '2019-06-01',
  theta: '2019-03-15', xpl: '2022-05-01', xcn: '2022-02-23',
}

export function getAssetLaunchDate(assetId: string): string {
  return L1_LAUNCH_DATES[assetId] ?? LAUNCH_DATES[assetId] ?? '2020-01-01'
}

export const NOTABLE_EVENTS = [
  { date: '2020-03-12', label: 'Black Thursday' },
  { date: '2022-05-09', label: 'Terra Collapse' },
  { date: '2022-11-08', label: 'FTX Collapse' },
  { date: '2023-03-10', label: 'SVB / USDC Depeg' },
]
