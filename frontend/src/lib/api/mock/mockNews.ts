export type NewsSentiment = 'positive' | 'neutral' | 'negative'
export type NewsCategory = 'regulation' | 'market' | 'protocol' | 'security' | 'adoption' | 'macro' | 'global'

export interface NewsArticle {
  id: string
  headline: string
  summary: string
  source: string
  publishedAt: string
  url: string
  sentiment: NewsSentiment
  category: NewsCategory
  relatedAssets: string[]
  isBreaking?: boolean
}

const NOW = new Date('2026-06-12T17:00:00Z').getTime()
const mins = (n: number) => new Date(NOW - n * 60 * 1000).toISOString()

export const MOCK_NEWS: NewsArticle[] = [
  {
    id: 'n1',
    headline: 'Circle Announces USDC Reserve Composition Audit Results — 100.2% Backed',
    summary:
      'Circle Internet Financial released its monthly proof-of-reserve attestation, confirming USDC remains fully backed by U.S. Treasury bills and cash equivalents. The reserve ratio of 100.2% reflects a slight over-collateralization as interest accrues. Grant Thornton conducted the independent verification.',
    source: 'The Block',
    publishedAt: mins(12),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['usdc'],
    isBreaking: true,
  },
  {
    id: 'n2',
    headline: 'SEC Issues New Guidance on Stablecoin Classification — Payment Stablecoins Exempt from Securities Rules',
    summary:
      'The U.S. Securities and Exchange Commission released a long-awaited policy statement clarifying that payment stablecoins backed 1:1 by fiat reserves do not constitute securities. The guidance is seen as a significant win for USDC, USDP, and GUSD issuers, while algorithmic and partially-collateralized models face continued scrutiny.',
    source: 'CoinDesk',
    publishedAt: mins(38),
    url: '#',
    sentiment: 'positive',
    category: 'regulation',
    relatedAssets: ['usdc', 'usdp', 'gusd', 'usdt'],
  },
  {
    id: 'n3',
    headline: 'Tether Discloses Q2 Reserve Breakdown: 82% in U.S. Treasuries, Reduces Bitcoin Holdings',
    summary:
      'Tether published its quarterly attestation showing a further shift toward U.S. government debt. Bitcoin and precious metals now represent under 4% of reserves combined, down from 8% a year ago. Critics note the attestation is not a full audit, though USDT\'s market cap has grown to $118B.',
    source: 'Bloomberg Crypto',
    publishedAt: mins(95),
    url: '#',
    sentiment: 'neutral',
    category: 'protocol',
    relatedAssets: ['usdt'],
  },
  {
    id: 'n4',
    headline: 'MakerDAO Passes MIP to Increase DSR to 8% — DAI Supply Surges 12% in 48 Hours',
    summary:
      'MakerDAO governance approved raising the Dai Savings Rate to 8% APY, triggering a sharp increase in DAI minting as yield-seekers move capital into the protocol. On-chain data shows DAI supply expanding by roughly $420M over two days. Some analysts warn of increased peg pressure if demand exceeds collateral growth.',
    source: 'Decrypt',
    publishedAt: mins(180),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['dai'],
  },
  {
    id: 'n5',
    headline: 'Federal Reserve Holds Rates at 4.25% — Stablecoin Yields Remain Elevated Relative to TradFi',
    summary:
      'The FOMC voted unanimously to hold the federal funds rate at 4.25–4.50%, citing persistent inflation and a resilient labor market. For stablecoin protocols that invest in T-bills, this maintains strong reserve yields. Analysts expect continued inflows into on-chain dollar products offering competitive APYs.',
    source: 'Reuters',
    publishedAt: mins(270),
    url: '#',
    sentiment: 'neutral',
    category: 'macro',
    relatedAssets: ['usdc', 'usdt', 'dai', 'frax', 'usdp', 'gusd'],
  },
  {
    id: 'n6',
    headline: 'FRAX v3 Migration Completes — Protocol Achieves 100% Collateralization Ratio',
    summary:
      'Frax Finance confirmed the full migration to FRAX v3, marking the protocol\'s transition away from its partial algorithmic model to a fully asset-backed stablecoin. The collateral backing now consists entirely of USDP, USDC, and RWA (real-world assets) via approved vaults.',
    source: 'The Defiant',
    publishedAt: mins(410),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['frax'],
  },
  {
    id: 'n7',
    headline: 'Binance Confirms BUSD Wind-Down on Track — Redemptions Hit $1.3B This Week',
    summary:
      'Binance and Paxos confirmed that the BUSD redemption process continues as planned, with $1.3 billion worth of BUSD redeemed this week. Total supply has fallen to $1.4B from a peak of $23B in late 2022. Paxos reiterated that all redemptions are being fulfilled in full.',
    source: 'CoinTelegraph',
    publishedAt: mins(520),
    url: '#',
    sentiment: 'neutral',
    category: 'market',
    relatedAssets: ['busd'],
  },
  {
    id: 'n8',
    headline: 'PayPal PYUSD Crosses $1B Market Cap on Solana — Merchant Integrations Drive Volume',
    summary:
      'PayPal\'s PYUSD stablecoin surpassed $1B in total supply, driven primarily by growth on the Solana network where low transaction costs make micropayments viable. PayPal cited integrations with over 200 online merchants accepting PYUSD as a checkout option as a key growth driver.',
    source: 'Fortune Crypto',
    publishedAt: mins(740),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['pyusd'],
  },
  {
    id: 'n9',
    headline: 'EU MiCA Stablecoin Rules Take Full Effect — Non-Compliant Issuers Face Trading Suspensions',
    summary:
      'The Markets in Crypto-Assets (MiCA) regulation\'s stablecoin provisions are now fully in force across the EU. Exchanges operating in EU jurisdictions have begun delisting stablecoins from issuers who have not obtained the required e-money institution license. USDC, EURC, and USDP have confirmed compliance.',
    source: 'Financial Times',
    publishedAt: mins(960),
    url: '#',
    sentiment: 'neutral',
    category: 'regulation',
    relatedAssets: ['usdc', 'usdp', 'gusd', 'usdt', 'busd'],
  },
  {
    id: 'n10',
    headline: 'Liquity v2 Launches with Interest-Rate Mechanism — LUSD Model Evolves to Stay Competitive',
    summary:
      'Liquity launched its v2 protocol with a variable interest rate for borrowing, replacing the one-time fee model of v1. The update aims to make LUSD more competitive against higher-yield alternatives. The Chicken Bonds mechanism has been retired, and a new governance-lite parameter system has been introduced.',
    source: 'DeFi Llama Blog',
    publishedAt: mins(1200),
    url: '#',
    sentiment: 'neutral',
    category: 'protocol',
    relatedAssets: ['lusd'],
  },
  {
    id: 'n11',
    headline: 'Gemini Dollar GUSD Integrated Into BlackRock\'s BUIDL Fund as Settlement Currency',
    summary:
      'BlackRock\'s tokenized treasury fund BUIDL will accept Gemini Dollar (GUSD) as a subscription and redemption currency alongside USDC. This marks one of the highest-profile institutional adoptions of GUSD, potentially increasing demand from institutional investors seeking regulated on-chain dollar exposure.',
    source: 'Wall Street Journal',
    publishedAt: mins(1500),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['gusd'],
  },
  {
    id: 'n12',
    headline: 'DeFi Exploit Drains $47M from Yield Protocol Using Flash Loan Attack',
    summary:
      'An unnamed yield aggregator on Ethereum suffered a flash loan attack draining approximately $47M in stablecoins, primarily USDC and DAI. The exploit targeted a reentrancy vulnerability in the protocol\'s reward distribution logic. Affected funds represent third-party deposits; underlying stablecoin pegs were unaffected.',
    source: 'PeckShield',
    publishedAt: mins(1800),
    url: '#',
    sentiment: 'negative',
    category: 'security',
    relatedAssets: ['usdc', 'dai'],
  },
  {
    id: 'n13',
    headline: 'Paxos Receives New York DFS Approval to Expand USDP Issuance Limit',
    summary:
      'Paxos Trust Company received approval from the New York Department of Financial Services to increase the maximum issuance cap for Pax Dollar (USDP). The expanded limit allows Paxos to accommodate growing institutional demand, particularly from custodians seeking a regulated dollar stablecoin alternative to USDC.',
    source: 'American Banker',
    publishedAt: mins(2100),
    url: '#',
    sentiment: 'positive',
    category: 'regulation',
    relatedAssets: ['usdp'],
  },
  {
    id: 'n14',
    headline: 'On-Chain Analytics: Stablecoin Transfer Volume Reaches $8.2T Annualized — Surpasses Visa',
    summary:
      'Data from Chainalysis shows stablecoin settlement volume on public blockchains annualizing at $8.2 trillion, exceeding Visa\'s $9T annual volume for the first time on a rolling 90-day basis. USDT accounts for 54% of volume, USDC 28%, and DAI 9%. Analysts call it a landmark moment for blockchain-based finance.',
    source: 'Chainalysis Research',
    publishedAt: mins(2500),
    url: '#',
    sentiment: 'positive',
    category: 'market',
    relatedAssets: ['usdt', 'usdc', 'dai'],
  },
  {
    id: 'n15',
    headline: 'TrueUSD Resumes Full Attestations After Accounting Firm Change',
    summary:
      'TrueUSD (TUSD) announced it has engaged a new attestation provider following the departure of its previous auditor. The issuer published a preliminary report confirming 100% backing and committed to monthly attestation releases going forward. TUSD price briefly traded at $0.9994 during the announcement period.',
    source: 'CoinDesk',
    publishedAt: mins(3000),
    url: '#',
    sentiment: 'neutral',
    category: 'protocol',
    relatedAssets: ['tusd'],
  },
  // ─── Layer 1 News ────────────────────────────────────────────────────────────
  {
    id: 'n16',
    headline: 'Bitcoin Spot ETFs Record $1.8B Single-Day Inflow — Largest Since January Launch',
    summary:
      'U.S.-listed Bitcoin spot ETFs recorded their highest single-day net inflow since the products launched, with BlackRock\'s IBIT alone attracting $1.1B. Total AUM across all Bitcoin ETFs now exceeds $62B. Institutional demand from wealth management platforms is cited as the primary driver.',
    source: 'Bloomberg ETF',
    publishedAt: mins(45),
    url: '#',
    sentiment: 'positive',
    category: 'market',
    relatedAssets: ['btc'],
    isBreaking: true,
  },
  {
    id: 'n17',
    headline: 'Ethereum Pectra Upgrade Goes Live — EIP-7702 Enables Smart Account Wallets',
    summary:
      'Ethereum\'s Pectra hard fork successfully activated on mainnet, introducing EIP-7702 which allows EOAs to temporarily behave as smart contract accounts. The upgrade also raises the validator staking cap to 2,048 ETH. Developers report smooth activation with no chain splits or major incidents.',
    source: 'Ethereum Foundation Blog',
    publishedAt: mins(110),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['eth'],
  },
  {
    id: 'n18',
    headline: 'Solana Network Processes Record 65M Daily Transactions — DePIN and Meme Coin Activity Surges',
    summary:
      'Solana hit a new all-time high for daily transaction count at 65 million, driven by activity from DePIN protocols including Helium and GEODNET alongside elevated meme coin trading. Average transaction fees remain below $0.001, underscoring the network\'s cost advantage for high-frequency applications.',
    source: 'Solana Foundation',
    publishedAt: mins(200),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['sol'],
  },
  {
    id: 'n19',
    headline: 'BNB Chain Launches "Pascal" Hardfork — EIP-7702 Compatibility and Lower Gas Fees',
    summary:
      'BNB Chain activated the Pascal upgrade, bringing EVM compatibility improvements and reducing average gas costs by approximately 30%. The fork also introduces an enhanced validator set rotation mechanism. Binance confirmed over 1,400 active dApps now running on the upgraded chain.',
    source: 'BNB Chain Blog',
    publishedAt: mins(340),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['bnb'],
  },
  {
    id: 'n20',
    headline: 'Avalanche Subnet Growth Hits 100 Deployed Chains — Enterprise Adoption Accelerates',
    summary:
      'Avalanche surpassed 100 active subnets, with recent additions from financial services firm WisdomTree and gaming studio Shrapnel. Ava Labs CEO highlighted the subnet architecture as a key differentiator for enterprises seeking customizable compliance and performance parameters.',
    source: 'Ava Labs',
    publishedAt: mins(480),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['avax'],
  },
  {
    id: 'n21',
    headline: 'Cardano Chang Hard Fork Activates — On-Chain Governance Era Begins',
    summary:
      'Cardano\'s Chang upgrade completed successfully, transitioning protocol governance from the three founding entities (IOHK, Cardano Foundation, Emurgo) to a community-led model using DReps and the Constitutional Committee. Over 1,200 DReps have registered ahead of the first on-chain vote.',
    source: 'IOHK Blog',
    publishedAt: mins(620),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['ada'],
  },
  {
    id: 'n22',
    headline: 'Polkadot Agile Coretime Goes Live — Parachain Slot Auctions Replaced by Flexible Pricing',
    summary:
      'Polkadot\'s Agile Coretime model replaced the parachain lease auction system, allowing teams to purchase blockspace on-demand rather than locking DOT for 96-week lease periods. Early data shows coretime usage 40% higher than slot auction demand, suggesting the new model improves accessibility for smaller teams.',
    source: 'Parity Technologies',
    publishedAt: mins(750),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['dot'],
  },
  {
    id: 'n23',
    headline: 'Tron Surpasses Ethereum in Daily USDT Transfer Volume for Third Consecutive Month',
    summary:
      'On-chain data shows Tron has exceeded Ethereum in daily USDT transfer count for the third month running, driven by low-cost transfers popular in emerging market remittance corridors. TRON\'s average USDT transfer fee of $0.80 compares favorably to Ethereum\'s $3–8 range during peak periods.',
    source: 'Nansen Research',
    publishedAt: mins(900),
    url: '#',
    sentiment: 'neutral',
    category: 'market',
    relatedAssets: ['trx'],
  },
  {
    id: 'n24',
    headline: 'Sui Ecosystem TVL Crosses $2B — Object-Centric Model Attracts DeFi Builders',
    summary:
      'Total value locked on Sui reached $2 billion, a tenfold increase since the start of the year. Leading protocols include Cetus Protocol (DEX) and Navi (lending). Analysts attribute growth to Sui\'s parallel execution model enabling latency-sensitive DeFi strategies not feasible on sequential blockchains.',
    source: 'DeFiLlama',
    publishedAt: mins(1100),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['sui'],
  },
  {
    id: 'n25',
    headline: 'NEAR Protocol Integrates AI Agents with Chain Abstraction — "The Open Web" Vision Takes Shape',
    summary:
      'NEAR Foundation announced native AI agent support through its chain abstraction layer, enabling AI models to interact with any blockchain using a single NEAR account. Early pilots include an AI trading agent managing positions across Ethereum, Solana, and NEAR DeFi protocols simultaneously.',
    source: 'NEAR Foundation',
    publishedAt: mins(1350),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['near'],
  },
  {
    id: 'n26',
    headline: 'Bittensor TAO Hits New Validator Records — 1M Daily AI Model Queries Processed',
    summary:
      'The Bittensor network crossed one million daily AI model inference queries, with subnet 1 (text prediction) and subnet 18 (multimodal) driving most volume. Validators are reporting improved emissions as demand-side utilization rises. The network now supports 32 active subnets across different AI domains.',
    source: 'Opentensor Foundation',
    publishedAt: mins(1600),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['tao'],
  },
  {
    id: 'n27',
    headline: 'Ethereum Layer 2 Ecosystem Surpasses $50B TVL — Base and Arbitrum Lead',
    summary:
      'Combined TVL across Ethereum L2 networks exceeded $50B for the first time, with Coinbase\'s Base at $12B and Arbitrum at $18B leading the pack. Ethereum mainnet itself holds $85B in DeFi TVL. ETH staking yield averaged 3.8% APR in Q2, attracting institutional stakers via Lido and Rocket Pool.',
    source: 'L2Beat',
    publishedAt: mins(1900),
    url: '#',
    sentiment: 'positive',
    category: 'market',
    relatedAssets: ['eth'],
  },
  {
    id: 'n28',
    headline: 'Bitcoin Mining Difficulty Reaches All-Time High — Hash Rate Rebounds Post-Halving',
    summary:
      'Bitcoin network difficulty adjusted upward by 3.2% to a new all-time high, reflecting a rebound in miner participation following the April 2024 halving. Hash rate now exceeds 750 EH/s, driven by large-scale ASICs from Bitmain and MicroBT. Mining economics have stabilized with BTC price supporting profitability.',
    source: 'Braiins Research',
    publishedAt: mins(2200),
    url: '#',
    sentiment: 'neutral',
    category: 'protocol',
    relatedAssets: ['btc'],
  },
  {
    id: 'n29',
    headline: 'Kaspa Achieves 100 Blocks-Per-Second Milestone in Testnet — Mainnet Upgrade Planned',
    summary:
      'Kaspa developers announced successful testing of 100 blocks-per-second throughput in a controlled testnet environment using the GHOSTDAG protocol. The mainnet currently runs at 10 BPS; the upgrade roadmap targets 100 BPS by end of year pending security audits. KAS price rallied 18% on the announcement.',
    source: 'Kaspa Community',
    publishedAt: mins(2450),
    url: '#',
    sentiment: 'positive',
    category: 'protocol',
    relatedAssets: ['kas'],
  },
  {
    id: 'n30',
    headline: 'Aptos Surges 40% After Stripe Integration Announcement for Cross-Border Payments',
    summary:
      'Aptos Labs and Stripe announced a partnership enabling merchants to receive payments settled in USDC on Aptos, leveraging the chain\'s sub-second finality and $0.001 transaction costs. The integration targets Southeast Asian and Latin American markets where cross-border transaction fees average 5–7%.',
    source: 'TechCrunch',
    publishedAt: mins(2700),
    url: '#',
    sentiment: 'positive',
    category: 'adoption',
    relatedAssets: ['apt'],
  },
]

export const NEWS_CATEGORIES: { value: NewsCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'regulation', label: 'Regulation' },
  { value: 'market', label: 'Market' },
  { value: 'protocol', label: 'Protocol' },
  { value: 'security', label: 'Security' },
  { value: 'adoption', label: 'Adoption' },
  { value: 'macro', label: 'Macro' },
  { value: 'global', label: 'Global' },
]

export function getMockNews(
  assetFilter: string = 'all',
  categoryFilter: NewsCategory | 'all' = 'all',
): NewsArticle[] {
  return MOCK_NEWS.filter((a) => {
    const matchAsset = assetFilter === 'all' || a.relatedAssets.includes(assetFilter)
    const matchCat = categoryFilter === 'all' || a.category === categoryFilter
    return matchAsset && matchCat
  })
}
