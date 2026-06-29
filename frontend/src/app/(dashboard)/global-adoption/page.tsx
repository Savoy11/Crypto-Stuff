'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, ExternalLink, ChevronDown, ChevronUp, Info, Loader2, Newspaper, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import type { CbdcEntry, CbdcDataResponse } from '@/app/live-data/cbdc-data/route'
import type { LiveNewsArticle } from '@/app/live-data/news/route'
import { PageHeader } from '@/components/ui/PageHeader'
import { LIVE_DATA } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────────────────────

type CbdcStatus = 'launched' | 'pilot' | 'development' | 'research' | 'inactive' | 'cancelled'
type CbdcType = 'retail' | 'wholesale' | 'both'
type Region = 'Africa' | 'Americas' | 'Asia-Pacific' | 'Europe' | 'Middle East'

// Fallback data for offline or error states
const FALLBACK_DATA: CbdcEntry[] = [
  // ── Launched ──────────────────────────────────────────────────────────────
  {
    country: 'Bahamas', flag: '🇧🇸', currency: 'Sand Dollar', status: 'launched', type: 'retail', region: 'Americas', launchYear: 2020, tech: 'NZIA',
    notes: 'The world\'s first nationally deployed CBDC, launched October 2020 by the Central Bank of the Bahamas. Designed to solve a core logistics problem: the archipelago\'s 700 islands make physical cash distribution costly and slow. The Sand Dollar supports offline transactions via NFC-enabled cards — critical for islands with intermittent connectivity. Adoption has been gradual; the central bank extended the rollout timeline and added merchant incentive programmes. It remains the most studied live CBDC for island-nation use cases.',
    sourceUrl: 'https://www.sanddollar.bs/',
  },
  {
    country: 'Nigeria', flag: '🇳🇬', currency: 'eNaira', status: 'launched', type: 'retail', region: 'Africa', launchYear: 2021, tech: 'Hyperledger Fabric',
    notes: 'Africa\'s first CBDC, launched October 2021. The CBN\'s primary goals were to improve financial inclusion in a country where over 35% of adults are unbanked and to reduce dependence on a volatile informal economy. Initial adoption was extremely low — only ~0.5% of Nigerians used it in its first year — largely because smartphone penetration and bank account requirements created barriers for the very population it targeted. In 2023 the CBN overhauled the eNaira with a USSD feature allowing transactions via basic mobile phones without internet access, which significantly broadened reach. The naira\'s ongoing depreciation and dollar shortages have added urgency to the programme.',
    sourceUrl: 'https://enaira.gov.ng/',
  },
  {
    country: 'Jamaica', flag: '🇯🇲', currency: 'JAM-DEX', status: 'launched', type: 'retail', region: 'Americas', launchYear: 2022,
    notes: 'JAM-DEX became legal tender in Jamaica in July 2022, one of the few CBDCs to achieve this status by law. The Bank of Jamaica partnered with eCurrency Mint and ran a controlled pilot in 2021 before the national rollout. To drive uptake, the government offered a one-time incentive of 2,500 Jamaican dollars (approximately US$16) to early adopters — a strategy that accelerated wallet registrations. The primary motivation is reducing Jamaica\'s reliance on cash, which is expensive to print and distribute, while providing financial services to the roughly 17% of adults who lack bank accounts.',
    sourceUrl: 'https://www.boj.org.jm/',
  },
  {
    country: 'Eastern Caribbean', flag: '🇦🇬', currency: 'DCash', status: 'launched', type: 'retail', region: 'Americas', launchYear: 2021, tech: 'Bitt Inc.',
    notes: 'DCash covers the eight member states of the Eastern Caribbean Currency Union — Antigua & Barbuda, Dominica, Grenada, Montserrat, St Kitts & Nevis, St Lucia, St Vincent & the Grenadines, and Anguilla. Built by Barbadian fintech Bitt Inc. on a private blockchain, it is one of the first multi-jurisdiction CBDCs in the world. In January 2022 a technical outage took DCash offline for two months, exposing resilience risks in single-vendor CBDC infrastructure. The ECCB resumed service in March 2022 and has since focused on redundancy improvements. The shared-currency model makes DCash a closely watched template for monetary unions.',
    sourceUrl: 'https://www.eccb-centralbank.org/',
  },
  {
    country: 'China', flag: '🇨🇳', currency: 'e-CNY (Digital Yuan)', status: 'pilot', type: 'retail', region: 'Asia-Pacific', launchYear: 2020, tech: 'Proprietary',
    notes: 'The e-CNY is by far the largest CBDC programme in the world by transaction volume and geographic reach. The People\'s Bank of China began research in 2014 and accelerated development after Facebook\'s Libra announcement in 2019 highlighted the risk of private currencies undermining monetary sovereignty. The pilot has been tested across 26 cities, distributed via lottery and government subsidies, and integrated into WeChat Pay, Alipay, and state bank apps. Strategic motivations include reducing dependence on the dollar-dominated SWIFT system, improving surveillance of domestic money flows, and internationalising the renminbi through cross-border pilots with Hong Kong, Thailand, UAE, and the BIS mBridge platform. As of 2024, cumulative e-CNY transactions exceed ¥7 trillion (approximately US$1 trillion).',
    sourceUrl: 'https://www.pbc.gov.cn/',
  },

  // ── Pilot ─────────────────────────────────────────────────────────────────
  {
    country: 'India', flag: '🇮🇳', currency: 'Digital Rupee (e₹)', status: 'pilot', type: 'both', region: 'Asia-Pacific', launchYear: 2022, tech: 'RBI proprietary',
    notes: 'The Reserve Bank of India launched parallel wholesale and retail pilots in late 2022, one of the few countries to run both simultaneously. The wholesale pilot targets interbank settlement of government securities, where it could reduce settlement risk and collateral requirements. The retail pilot has expanded to 13 banks, 9 cities, and now includes non-bank payment service providers. Key design choices include token-based (not account-based) architecture for privacy and a programmable layer being tested for government subsidy distribution. India\'s motivation is partly strategic — the country is the world\'s largest recipient of remittances, and a cross-border digital rupee could reduce the ~5% average fee on those flows. A full launch decision is expected following the pilot evaluation.',
    sourceUrl: 'https://www.rbi.org.in/',
  },
  {
    country: 'Brazil', flag: '🇧🇷', currency: 'DREX', status: 'pilot', type: 'wholesale', region: 'Americas', launchYear: 2023, tech: 'Hyperledger Besu (EVM)',
    notes: 'DREX (Digital Real) stands out globally for its explicitly DeFi-compatible design. Built on Hyperledger Besu — an enterprise Ethereum Virtual Machine — it is designed for tokenised asset settlement: real estate, government bonds, and agricultural receivables can be issued as on-chain tokens and settled against DREX in atomic transactions. The Banco Central do Brasil sees this as modernising Brazil\'s already advanced PIX instant payment system by adding programmability. The pilot included 16 financial institutions and tested smart-contract-based delivery-versus-payment. Privacy concerns around transaction visibility on a shared ledger have been a key design challenge, addressed through zero-knowledge proof experiments.',
    sourceUrl: 'https://www.bcb.gov.br/',
  },
  {
    country: 'European Union', flag: '🇪🇺', currency: 'Digital Euro', status: 'development', type: 'retail', region: 'Europe',
    notes: 'The ECB\'s digital euro project entered a two-year "preparation phase" in November 2023 after completing an investigation phase. The primary stated goal is preserving "monetary sovereignty" — ensuring Europeans have access to central bank money in an increasingly digital economy where private payment systems (Visa, Mastercard, and Big Tech wallets) dominate. Key design decisions include a €3,000 holding limit per person to prevent bank disintermediation, no interest paid on holdings, and offline payment capability. The European Commission has proposed legislation, but the project faces significant political headwinds — several member states and the banking industry have expressed concern about its impact on commercial banks\' deposit base and lending capacity. No launch date has been set; estimates point to 2028 at the earliest.',
    sourceUrl: 'https://www.ecb.europa.eu/euro/digital_euro/html/index.en.html',
  },
  {
    country: 'Russia', flag: '🇷🇺', currency: 'Digital Ruble', status: 'pilot', type: 'retail', region: 'Europe', launchYear: 2023, tech: 'Bank of Russia platform',
    notes: 'Russia\'s CBDC development has been substantially accelerated by the 2022 sanctions that disconnected major Russian banks from SWIFT and Visa/Mastercard networks. A digital ruble operating on sovereign infrastructure gives Russia a payments channel that bypasses Western-controlled systems. The Bank of Russia began a pilot with 13 banks in August 2023, subsequently expanded to retail customers. Russia is also exploring cross-border use with China, India, and other BRICS members via direct ruble-to-yuan CBDC links that would reduce dollar dependency in trade settlement. Domestically, the digital ruble includes programmable spending restrictions — a controversial feature allowing authorities to earmark funds for specific purposes.',
    sourceUrl: 'https://cbr.ru/',
  },
  {
    country: 'Thailand', flag: '🇹🇭', currency: 'Digital Baht', status: 'pilot', type: 'retail', region: 'Asia-Pacific', launchYear: 2023,
    notes: 'The Bank of Thailand has run two distinct CBDC tracks: a wholesale pilot (Project Inthanon) exploring interbank settlement since 2018, and a more recent retail pilot focused on programmable money. The retail pilot recruited 10,000 participants and tested purpose-bound payments — funds that can only be spent in specific categories or with designated merchants. This feature is targeted at government welfare programmes where leakage and fraud are persistent problems. Thailand is also a participant in the BIS mBridge platform alongside China, Hong Kong, the UAE, and Saudi Arabia, positioning the digital baht for cross-border trade settlement in Southeast Asia.',
    sourceUrl: 'https://www.bot.or.th/',
  },
  {
    country: 'Kazakhstan', flag: '🇰🇿', currency: 'Digital Tenge', status: 'pilot', type: 'retail', region: 'Asia-Pacific', launchYear: 2023, tech: 'National Bank platform',
    notes: 'Kazakhstan launched its digital tenge pilot in 2023, motivated partly by the country\'s position as a major crypto mining hub following China\'s 2021 ban — crypto familiarity in the population makes digital currency adoption more plausible. The pilot tests smart contract-based wage and welfare payments, where conditions (e.g., proven employment) unlock disbursement automatically. Kazakhstan\'s national payment infrastructure has been modernised through integration with the existing Instant Payment System, allowing the digital tenge to coexist with conventional rails. Cross-border use with Russia and China is a medium-term objective, reflecting Kazakhstan\'s role as a transit hub between the two largest CBDC programmes.',
    sourceUrl: 'https://nationalbank.kz/',
  },
  {
    country: 'Saudi Arabia', flag: '🇸🇦', currency: 'Project Aber / mBridge', status: 'pilot', type: 'wholesale', region: 'Middle East',
    notes: 'Saudi Arabia\'s CBDC work has two layers. Project Aber — a bilateral wholesale pilot with the UAE — demonstrated that a shared distributed ledger could settle cross-border payments between the two countries without correspondent banks, cutting cost and settlement time from days to seconds. More significantly, SAMA is a founding participant in the BIS mBridge multi-CBDC platform alongside China, Hong Kong, Thailand, and the UAE. mBridge processed over $22 million in real transactions during its 2022 pilot, and Saudi Arabia joined as a full participant in 2023. With oil trade increasingly invoiced in non-dollar currencies, a sovereign CBDC infrastructure directly supports the Kingdom\'s Vision 2030 goal of reducing dollar dependence in energy exports.',
    sourceUrl: 'https://www.sama.gov.sa/',
  },
  {
    country: 'UAE', flag: '🇦🇪', currency: 'Digital Dirham', status: 'pilot', type: 'wholesale', region: 'Middle East', launchYear: 2023,
    notes: 'The Central Bank of the UAE launched a Digital Dirham strategy in 2023 covering both domestic retail and cross-border wholesale use cases. On the wholesale side, the UAE is a core participant in the BIS mBridge platform, which has processed live cross-border transactions between central banks in Asia and the Middle East. The retail component focuses on financial inclusion for the UAE\'s large expatriate workforce — remittances account for a significant share of personal outflows — and on reducing friction in e-commerce. The UAE also completed Project Aber with Saudi Arabia. As a major international financial centre, the UAE\'s CBDC design must accommodate complex AML/KYC obligations while supporting near-instant settlement for its trading partners.',
    sourceUrl: 'https://www.centralbank.ae/',
  },
  {
    country: 'Ghana', flag: '🇬🇭', currency: 'e-Cedi', status: 'pilot', type: 'retail', region: 'Africa', launchYear: 2022, tech: 'G+D Filia',
    notes: 'The e-Cedi pilot, run with German currency technology firm G+D using its Filia platform, is designed specifically for financial inclusion in a country where about 40% of the population remains unbanked. Its defining feature is offline functionality: the e-Cedi can be used without internet or electricity through NFC hardware cards, targeting rural communities in northern Ghana where network coverage is limited. The Bank of Ghana also wants to reduce the cost of printing and distributing physical cedi notes, which disproportionately burdens remote regions. The pilot tested peer-to-peer transfers, merchant payments, and government-to-person disbursements. Ghana\'s e-Cedi is one of the most technically sophisticated offline-capable CBDC designs in Africa.',
    sourceUrl: 'https://www.bog.gov.gh/',
  },
  {
    country: 'Singapore', flag: '🇸🇬', currency: 'Project Orchid / Purpose Bound Money', status: 'pilot', type: 'wholesale', region: 'Asia-Pacific', launchYear: 2022,
    notes: 'The Monetary Authority of Singapore (MAS) has positioned Singapore as a global CBDC experimentation hub rather than a first-mover on retail issuance. Project Orchid explores programmable "Purpose Bound Money" — digital value that carries embedded conditions governing how and where it can be spent — tested for government vouchers and corporate treasury use. MAS is also a participant in mBridge and has run Project Dunbar (with Australia, Malaysia, and South Africa) for multi-CBDC cross-border settlement. Singapore\'s strategy prioritises interoperability standards and wholesale infrastructure over consumer-facing retail CBDC, reflecting its role as an international financial centre where wholesale settlement efficiency has the largest economic impact.',
    sourceUrl: 'https://www.mas.gov.sg/',
  },

  // ── Development ───────────────────────────────────────────────────────────
  {
    country: 'United States', flag: '🇺🇸', currency: 'Digital Dollar', status: 'research', type: 'both', region: 'Americas',
    notes: 'The United States is the most consequential holdout on retail CBDC. The Federal Reserve launched FedNow in 2023 — an instant payment rail, not a CBDC — and has conducted wholesale research through Project Cedar (cross-border FX settlement) and Project Hamilton (with MIT). A retail Digital Dollar faces significant political opposition: several states have passed laws banning CBDC use, and multiple bills in Congress would prohibit the Fed from issuing one without explicit legislative authorisation. Critics cite surveillance risk and potential bank disintermediation. The Fed has emphasised it would not proceed without clear Congressional mandate. Wholesale tokenised settlement research continues quietly, as dollar-denominated trade and treasury operations remain a major focus for the BIS and G7 central banks.',
    sourceUrl: 'https://www.federalreserve.gov/cbdc',
  },
  {
    country: 'United Kingdom', flag: '🇬🇧', currency: 'Digital Pound (Britcoin)', status: 'development', type: 'retail', region: 'Europe',
    notes: 'The Bank of England and HM Treasury published a consultation paper in February 2023 proposing a "Britcoin" with an initial holding limit of £10,000–£20,000 per person. The BoE argues it is necessary to ensure Britons retain access to central bank money as cash usage declines and private digital payment platforms grow. However, it also published a Financial Stability Report note acknowledging the risk to commercial banks\' deposit funding if even a fraction of deposits shift to the digital pound. A dedicated Digital Pound Lab has been set up to prototype the technology. No launch date has been set; primary legislation is expected to take several years, placing full deployment no earlier than 2028.',
    sourceUrl: 'https://www.bankofengland.co.uk/digital-pound',
  },
  {
    country: 'Japan', flag: '🇯🇵', currency: 'Digital Yen', status: 'development', type: 'retail', region: 'Asia-Pacific', launchYear: 2023, tech: 'PoC phase 3',
    notes: 'The Bank of Japan began a proof-of-concept in April 2021 and entered Phase 3 in 2023, adding a pilot environment that involves private-sector banks and payment service providers. Japan\'s motivation is partly defensive — a rapidly ageing population with high cash preferences means retail adoption will be challenging, but authorities want infrastructure ready if demographics or technology shift demand. Japan is also a founding member of the G7 CBDC working group and participates in BIS cross-border research. The BoJ has stated it will decide whether to issue a digital yen around 2026, based on pilot outcomes and political consensus. Privacy architecture — whether transaction data is visible to the central bank — is a key unresolved question.',
    sourceUrl: 'https://www.boj.or.jp/',
  },
  {
    country: 'South Korea', flag: '🇰🇷', currency: 'Digital Won', status: 'development', type: 'retail', region: 'Asia-Pacific', launchYear: 2024,
    notes: 'The Bank of Korea ran a large-scale wholesale tokenisation pilot in 2024 involving 100,000 participants, testing the use of tokenised deposits on a distributed ledger for settlement. South Korea has also conducted extensive research into retail CBDC architecture, focusing on privacy-preserving designs and interoperability with its existing fast payment systems. The country\'s extremely high digital payments penetration — over 95% of transactions are already electronic — means a retail CBDC competes directly with established fintech infrastructure. The BOK is studying whether a two-tier model (central bank issues CBDC, commercial banks distribute) or direct accounts would work better in the Korean market.',
    sourceUrl: 'https://www.bok.or.kr/',
  },
  {
    country: 'Australia', flag: '🇦🇺', currency: 'eAUD', status: 'research', type: 'wholesale', region: 'Asia-Pacific',
    notes: 'The Reserve Bank of Australia completed a retail CBDC pilot in 2023 (with 16 use cases including tokenised FX settlement, debt securities, and carbon credit trading) but concluded that a retail eAUD was not a priority given Australia\'s already efficient payment infrastructure. Attention has since shifted to Project Acacia (2024), which focuses on wholesale tokenised settlement for institutional markets. Australia is also a past participant in Project Dunbar with Singapore, Malaysia, and South Africa. The RBA\'s considered position — "we don\'t see a compelling case for retail CBDC right now, but wholesale has real merit" — is influential among central banks in advanced economies with mature payment rails.',
    sourceUrl: 'https://www.rba.gov.au/',
  },
  {
    country: 'Canada', flag: '🇨🇦', currency: 'Digital Canadian Dollar', status: 'research', type: 'retail', region: 'Americas',
    notes: 'The Bank of Canada has run CBDC research since 2017 through Project Jasper (wholesale settlement) and ongoing retail feasibility work. Its current position is that a retail CBDC is not needed today but could become necessary if cash use declines sharply or if private stablecoins achieve widespread adoption. The bank has published detailed research on privacy architectures, offline capability, and resilience requirements. Unlike the US, Canada has not faced major political opposition to the concept, but no legislative mandate exists and no pilot is underway. The Bank frames its research as contingency planning — being ready to issue quickly if circumstances change.',
    sourceUrl: 'https://www.bankofcanada.ca/',
  },
  {
    country: 'Mexico', flag: '🇲🇽', currency: 'Digital Peso', status: 'development', type: 'retail', region: 'Americas', launchYear: 2025,
    notes: 'Banxico (the Bank of Mexico) committed to launching a retail CBDC by the end of 2024, later revised to 2025. Financial inclusion is the primary driver: roughly 37% of Mexican adults lack formal bank accounts, while the country receives over $60 billion in annual remittances — one of the largest flows globally. A digital peso accessible via smartphone or basic phone could lower remittance fees (currently averaging 2.5–3.5% from the US), which disproportionately affect the 10 million Mexicans working in the US. The design draws on SPEI, Mexico\'s existing 24/7 interbank system, and is expected to use a two-tier distribution model through banks and fintech lenders.',
    sourceUrl: 'https://www.banxico.org.mx/',
  },
  {
    country: 'Indonesia', flag: '🇮🇩', currency: 'Rupiah Digital', status: 'development', type: 'wholesale', region: 'Asia-Pacific',
    notes: 'Bank Indonesia published its CBDC white paper in 2022 under the "Project Garuda" framework, outlining a phased approach: wholesale issuance first (interbank settlement), then retail issuance in later phases. The wholesale focus makes sense given Indonesia\'s fragmented banking sector across 17,000 islands and a priority need to modernise interbank settlement infrastructure. Indonesia is also motivated by China\'s e-CNY ambitions in Southeast Asia — preserving monetary sovereignty against foreign digital currencies is an explicit goal. Bank Indonesia participates in regional CBDC interoperability discussions with ASEAN central banks, and cross-border settlement with Singapore and Malaysia is a medium-term objective.',
    sourceUrl: 'https://www.bi.go.id/',
  },
  {
    country: 'Kenya', flag: '🇰🇪', currency: 'Digital Shilling', status: 'research', type: 'retail', region: 'Africa',
    notes: 'Kenya\'s central bank released a CBDC discussion paper in 2023 but has proceeded cautiously, aware that M-Pesa — the mobile money platform used by over 60% of the population — already provides near-universal financial inclusion. The core design challenge is clear: if M-Pesa already works, what does a CBDC add? The CBK is exploring whether a digital shilling could reduce M-Pesa\'s near-monopoly transaction fees, enable government-to-person payments without private intermediaries, and provide an infrastructure not dependent on a single telecoms company (Safaricom). Kenya\'s experience is closely watched across Sub-Saharan Africa as a test case for CBDC value proposition in markets with mature mobile money ecosystems.',
    sourceUrl: 'https://www.centralbank.go.ke/',
  },
  {
    country: 'South Africa', flag: '🇿🇦', currency: 'Digital Rand', status: 'research', type: 'wholesale', region: 'Africa',
    notes: 'The South African Reserve Bank completed Project Khokha — a wholesale DLT settlement trial — in 2018, one of the earliest in the world, demonstrating that tokenised rand could settle interbank transactions faster and with less collateral. Project Khokha 2 (2021) extended the work to tokenised money market securities. South Africa also participated in Project Dunbar alongside Australia, Singapore, and Malaysia for multi-CBDC cross-border research. A retail CBDC study was initiated in 2024, but the SARB has been explicit that it sees wholesale modernisation as the higher priority. Regulatory alignment with the Financial Sector Conduct Authority on consumer protection and AML is a prerequisite for any retail move.',
    sourceUrl: 'https://www.resbank.co.za/',
  },
  {
    country: 'Turkey', flag: '🇹🇷', currency: 'Digital Lira', status: 'development', type: 'retail', region: 'Europe', launchYear: 2023, tech: 'CBRT platform',
    notes: 'The Central Bank of the Republic of Turkey conducted its first successful Digital Lira payment transactions in December 2023. Turkey\'s motivation is unusually acute: chronic inflation (which reached 85% in 2022) has driven significant dollarisation and crypto adoption, with Turkey consistently ranking among the top countries for crypto ownership as a share of population. A digital lira that keeps value in the domestic monetary system — and is programmable with spending conditions — offers the CBRT a tool to retain monetary control and reduce dollar demand. The technical architecture is built on the CBRT\'s own distributed ledger platform. A broader pilot with banks and payment providers is expected before a full retail rollout.',
    sourceUrl: 'https://www.tcmb.gov.tr/',
  },
  {
    country: 'Vietnam', flag: '🇻🇳', currency: 'Digital Dong', status: 'research', type: 'retail', region: 'Asia-Pacific',
    notes: 'Vietnam\'s State Bank has been studying CBDC feasibility since 2021. The context is notable: Vietnam consistently ranks in the top five globally for crypto adoption as a share of population, driven by a young, tech-savvy demographic, high smartphone penetration, and distrust of the banking system among rural populations. The SBV frames a digital dong partly as a way to channel the enthusiasm for digital assets into a regulated, state-controlled instrument — reducing illicit crypto flows while providing the payment convenience users want. Cross-border settlement with China is a longer-term consideration given the two countries\' extensive trade relationship.',
    sourceUrl: 'https://www.sbv.gov.vn/',
  },

  // ── Additional Pilot ──────────────────────────────────────────────────────
  {
    country: 'Sweden', flag: '🇸🇪', currency: 'e-Krona', status: 'pilot', type: 'retail', region: 'Europe', launchYear: 2020, tech: 'R3 Corda',
    notes: 'Sweden\'s Riksbank has been running e-Krona pilots since 2020, making it one of the most advanced retail CBDC programmes in a high-income country. The motivation is stark: Sweden has the lowest cash usage in the world — less than 10% of transactions use physical cash — and the Riksbank is concerned that if cash disappears entirely without a public digital alternative, citizens would depend entirely on commercial bank money and private payment rails. Phase 3 of the pilot (2023–2024) tested offline functionality, integration with point-of-sale systems, and interoperability with BIS projects. A final decision on issuance awaits a government commission report.',
    sourceUrl: 'https://www.riksbank.se/en-gb/payments--cash/e-krona/',
  },
  {
    country: 'Hong Kong', flag: '🇭🇰', currency: 'e-HKD', status: 'pilot', type: 'retail', region: 'Asia-Pacific', launchYear: 2023, tech: 'Multiple DLT platforms',
    notes: 'The Hong Kong Monetary Authority completed Pilot Phase 1 of the e-HKD in 2023, working with 16 private-sector firms across six use cases: programmable payments, offline payments, tokenised deposits, Web3 transactions, settlement of tokenised assets, and lending. Phase 2 is focusing on deepening the tokenised deposits and cross-boundary payment use cases. Hong Kong occupies a unique position: as a Special Administrative Region, it operates its own monetary system independently of the e-CNY, and the HKMA has been careful to design the e-HKD as a complement to — not a replacement for — existing bank and Faster Payment System infrastructure.',
    sourceUrl: 'https://www.hkma.gov.hk/eng/key-functions/international-financial-infrastructure/fintech/e-hkd/',
  },
  {
    country: 'Israel', flag: '🇮🇱', currency: 'Digital Shekel', status: 'pilot', type: 'retail', region: 'Middle East', launchYear: 2023,
    notes: 'The Bank of Israel published a detailed digital shekel concept paper in 2021 and moved to a technology experiment phase in 2023. Israel\'s primary motivations are financial inclusion for the ultra-Orthodox and Arab communities (who have lower bank account penetration), reducing dependence on cash (which supports the shadow economy), and improving cross-border payment efficiency for a small open economy heavily dependent on international trade and investment. The digital shekel design incorporates strong privacy features — the central bank would not see individual transactions — and interest-bearing features are explicitly excluded to avoid bank disintermediation concerns.',
    sourceUrl: 'https://www.boi.org.il/en/financial-stability/digital-shekel/',
  },
  {
    country: 'Bahrain', flag: '🇧🇭', currency: 'Digital Dinar', status: 'pilot', type: 'wholesale', region: 'Middle East',
    notes: 'The Central Bank of Bahrain has conducted wholesale CBDC experiments through Project Aber (the cross-border bilateral CBDC with Saudi Arabia and the UAE) and separate bilateral trials with regional central banks. Bahrain\'s small but highly open financial sector — it is the Gulf\'s oldest financial hub — makes wholesale settlement efficiency a priority. The CBB has also issued regulatory guidance on stablecoins and crypto, positioning Bahrain as a regional fintech-friendly jurisdiction. A retail CBDC study is at an early stage.',
    sourceUrl: 'https://www.cbb.gov.bh/',
  },
  {
    country: 'Cambodia', flag: '🇰🇭', currency: 'Bakong', status: 'launched', type: 'retail', region: 'Asia-Pacific', launchYear: 2020, tech: 'Hyperledger Iroha',
    notes: 'Cambodia\'s Bakong, launched by the National Bank of Cambodia in October 2020, is among the earliest deployed blockchain-based payment systems built by a central bank. Unlike most CBDCs, Bakong operates as a payment infrastructure layer rather than a pure CBDC — it allows both Cambodian riel and US dollars to be transferred digitally (Cambodia is heavily dollarised). Built on Hyperledger Iroha with support from Japanese firm Soramitsu, Bakong has grown to cover over 50 financial institutions and millions of users. Its primary goal was to reduce dollarisation by making riel transactions easier and more useful.',
    sourceUrl: 'https://bakong.nbc.gov.kh/',
  },
  {
    country: 'Switzerland', flag: '🇨🇭', currency: 'Project Helvetia / wCBDC', status: 'pilot', type: 'wholesale', region: 'Europe', launchYear: 2021, tech: 'SIX Digital Exchange',
    notes: 'The Swiss National Bank has led two landmark wholesale CBDC experiments. Project Helvetia (2021) was the first central bank in the world to settle tokenised assets using a wholesale CBDC on a regulated securities exchange — the SIX Digital Exchange. Helvetia Phase II (2023) integrated the wholesale CBDC directly into the SNB\'s existing RTGS system, settling tokenised bonds with commercial banks. The SNB has been emphatic that it sees no need for retail CBDC in Switzerland, but considers wholesale CBDC important for the future of institutional digital asset markets. Project Mariana (with BIS, France, and Singapore) further tested automated market-maker-based FX settlement between wholesale CBDCs.',
    sourceUrl: 'https://www.bis.org/about/bisih/topics/cbdc/helvetia.htm',
  },
  {
    country: 'France', flag: '🇫🇷', currency: 'Digital Euro (Wholesale)', status: 'pilot', type: 'wholesale', region: 'Europe', launchYear: 2021,
    notes: 'The Banque de France has been one of the most active central banks in wholesale CBDC experimentation, running eight pilots between 2020 and 2023 covering interbank settlement, government bond issuance, cross-border payments, and automated market-maker FX. France participates in Project Mariana with BIS and the Swiss and Singapore central banks, and in the ECB\'s digital euro preparation phase for retail. The French pilots have demonstrated that wholesale CBDC can interoperate with commercial bank tokenised deposits and that atomic DvP for digital securities is technically feasible at scale.',
    sourceUrl: 'https://www.banque-france.fr/en/financial-stability/market-finance-and-financial-infrastructures/wholesale-central-bank-digital-currency',
  },
  // ── Additional Development ─────────────────────────────────────────────────
  {
    country: 'Ukraine', flag: '🇺🇦', currency: 'e-Hryvnia', status: 'development', type: 'retail', region: 'Europe', launchYear: 2018,
    notes: 'The National Bank of Ukraine conducted one of the earliest CBDC pilot experiments globally, distributing e-Hryvnia to NBU employees in a closed pilot in 2018. Development was paused during political turbulence and then significantly disrupted by the February 2022 Russian invasion. Despite the war, the NBU has continued CBDC research — seeing the e-Hryvnia as a potential tool for distributing government aid and social payments to displaced citizens, bypassing damaged physical infrastructure. The wartime context has added urgency: a digital hryvnia could help maintain monetary sovereignty if physical cash systems are further disrupted.',
    sourceUrl: 'https://bank.gov.ua/en/payments/e-hryvnia',
  },
  {
    country: 'Norway', flag: '🇳🇴', currency: 'Digital Krone', status: 'development', type: 'retail', region: 'Europe',
    notes: 'Norges Bank has been researching a digital krone since 2016 — one of the earliest central bank CBDC research programmes globally. Like Sweden, the motivation is the dramatic decline in cash usage: Norway ranks among the top three countries globally for cashless transactions. The bank completed a four-phase research programme in 2024 and is now in a design phase focused on how a retail CBDC could coexist with the existing banking system. Norway participates in Project Icebreaker (with BIS, Israel, and Sweden) exploring cross-border retail CBDC payments.',
    sourceUrl: 'https://www.norges-bank.no/en/topics/payment-systems/cbdc/',
  },
  {
    country: 'Philippines', flag: '🇵🇭', currency: 'Digital Peso (Project CBDCPh)', status: 'development', type: 'wholesale', region: 'Asia-Pacific',
    notes: 'The Bangko Sentral ng Pilipinas launched Project CBDCPh in 2022, focusing initially on wholesale interbank settlement. The Philippines has one of the most active retail digital payment ecosystems in Southeast Asia (GCash, Maya), so the BSP has been careful to position wholesale CBDC as infrastructure for banks rather than a consumer-facing product. Financial inclusion — roughly 23% of adults remain unbanked — remains a consideration for future retail phases. The Philippines is also a top-five global remittance recipient, and a CBDC settlement layer could reduce the roughly $1.5B in annual remittance fees paid by overseas Filipino workers.',
    sourceUrl: 'https://www.bsp.gov.ph/financial-stability/digital-finance/digital-peso',
  },
  {
    country: 'Malaysia', flag: '🇲🇾', currency: 'Digital Ringgit', status: 'development', type: 'wholesale', region: 'Asia-Pacific',
    notes: 'Bank Negara Malaysia participated in Project Dunbar — alongside Australia, Singapore, and South Africa — which demonstrated real-value cross-border settlements between central banks using CBDCs. BNM has since published research on a domestic wholesale CBDC for interbank settlement and tokenised asset markets, while explicitly stating it does not currently see a compelling case for a retail CBDC. Malaysia\'s well-developed instant payment infrastructure (DuitNow) means the retail use case has lower marginal value. Wholesale efficiency and regional integration with ASEAN partners remain the primary drivers.',
    sourceUrl: 'https://www.bnm.gov.my/',
  },
  {
    country: 'Georgia', flag: '🇬🇪', currency: 'Digital Lari', status: 'development', type: 'retail', region: 'Europe',
    notes: 'The National Bank of Georgia launched a Digital Lari project in 2021, working with Ripple as a technology partner on a blockchain-based platform. Georgia occupies an interesting position: it has one of the region\'s most open economies, a large unbanked rural population (~20% of adults), and significant exposure to Russian economic pressure — motivating both financial inclusion goals and currency sovereignty objectives. The project aims to reduce Georgia\'s reliance on USD cash (which circulates widely alongside the lari), improve government payment efficiency, and lay groundwork for eventual cross-border use with Turkey and Azerbaijan.',
    sourceUrl: 'https://nbg.gov.ge/en/page/digital-lari',
  },
  {
    country: 'Iran', flag: '🇮🇷', currency: 'Digital Rial', status: 'development', type: 'retail', region: 'Middle East', launchYear: 2023,
    notes: 'Iran\'s Central Bank of Iran launched a Digital Rial pilot in January 2023 on Kish Island, with plans for national rollout. Iran\'s motivation is unusually explicit: decades of US-led sanctions have cut Iran off from SWIFT and dollar-clearing systems, and a sovereign digital currency operating on domestic infrastructure could facilitate trade with sanctioned trading partners outside Western financial rails. Iran and Russia have discussed direct CBDC-to-CBDC links for bilateral trade settlement. Domestically, the Digital Rial also addresses hyperinflation erosion of trust in physical rial — the currency lost over 80% of its value between 2018 and 2023.',
    sourceUrl: 'https://www.cbi.ir/',
  },
  // ── Additional Research ────────────────────────────────────────────────────
  {
    country: 'New Zealand', flag: '🇳🇿', currency: 'Digital NZD', status: 'research', type: 'retail', region: 'Asia-Pacific',
    notes: 'The Reserve Bank of New Zealand published a CBDC consultation document in 2021 and is conducting research into whether a digital NZD is warranted. New Zealand\'s position resembles Australia\'s: a high-income country with efficient payment infrastructure where the retail CBDC value proposition is narrow. The RBNZ is particularly focused on the financial inclusion angle — Māori and Pasifika communities have lower banking access — and on ensuring that a digital alternative to cash exists as banknote usage declines. The RBNZ has not announced a pilot timeline and views the work as longer-term research.',
    sourceUrl: 'https://www.rbnz.govt.nz/money-and-cash/future-of-money',
  },
  {
    country: 'Argentina', flag: '🇦🇷', currency: 'Digital Peso', status: 'research', type: 'retail', region: 'Americas',
    notes: 'The Banco Central de la República Argentina has explored CBDC concepts, though the project has been complicated by Argentina\'s extreme monetary instability — annual inflation exceeded 200% in 2023 — and a political environment deeply sceptical of government-controlled digital money. The adoption of the US dollar as a semi-official parallel currency and widespread use of stablecoins (Argentina ranks among the top global crypto adopters) suggests that monetary trust, not technology, is the core challenge. Any Argentine CBDC would need to address severe trust deficits built up over repeated bank freezes and currency crises.',
    sourceUrl: 'https://www.bcra.gob.ar/',
  },
  {
    country: 'Colombia', flag: '🇨🇴', currency: 'Digital Peso', status: 'research', type: 'retail', region: 'Americas',
    notes: 'Banco de la República (Colombia\'s central bank) has been studying CBDC since 2020, participating in BIS research groups and publishing analytical papers on design trade-offs. Colombia\'s financial inclusion gap — roughly 30% of adults unbanked — provides motivation, though the rapid growth of digital wallet Nequi (owned by Bancolombia, with 20M+ users) and the expansion of the PSE instant payment system have reduced the urgency. Colombia also has a significant informal economy where CBDC could improve tax compliance. No pilot has been announced.',
    sourceUrl: 'https://www.banrep.gov.co/',
  },
  {
    country: 'Morocco', flag: '🇲🇦', currency: 'Digital Dirham', status: 'research', type: 'retail', region: 'Africa',
    notes: 'Bank Al-Maghrib has been studying CBDC since 2021, with formal research published in 2022. Morocco is in the process of liberalising its financial sector and passed a comprehensive crypto regulatory framework in 2023 — one of the first in Africa — which creates a more hospitable environment for digital currency development. The primary rationale is financial inclusion: roughly 29% of Moroccan adults lack bank accounts. Morocco also receives significant diaspora remittances (primarily from France and Spain), and a digital dirham could reduce those fees.',
    sourceUrl: 'https://www.bkam.ma/',
  },
  {
    country: 'Egypt', flag: '🇪🇬', currency: 'Digital Pound', status: 'research', type: 'retail', region: 'Africa',
    notes: 'The Central Bank of Egypt launched a formal CBDC feasibility study in 2023, prompted in part by IMF and World Bank pressure to modernise payment infrastructure. Egypt has a large unbanked population (roughly 33% of adults) and receives the highest remittance inflows in the Middle East and North Africa region — over $28B annually. The CBE has also been rolling out Meeza, a national prepaid card scheme, and the InstaPay real-time transfer system, both of which would form the infrastructure foundation for any digital pound pilot.',
    sourceUrl: 'https://www.cbe.org.eg/',
  },
  {
    country: 'Pakistan', flag: '🇵🇰', currency: 'Digital Rupee', status: 'research', type: 'retail', region: 'Asia-Pacific',
    notes: 'The State Bank of Pakistan published a CBDC exploration roadmap in 2022 as part of its broader National Payment Systems Strategy. Pakistan has one of the lowest financial inclusion rates among large economies — roughly 21% of adults have formal bank accounts — and is the world\'s sixth-largest remittance recipient. The SBP views CBDC as a potential leapfrog technology for the unbanked. However, Pakistan faces significant macroeconomic headwinds — an IMF programme, currency crises, and chronic inflation — that complicate CBDC implementation.',
    sourceUrl: 'https://www.sbp.org.pk/',
  },
  {
    country: 'Bangladesh', flag: '🇧🇩', currency: 'Digital Taka', status: 'research', type: 'retail', region: 'Asia-Pacific',
    notes: 'Bangladesh Bank has been exploring a CBDC since 2021, publishing a concept note and conducting internal feasibility studies. Bangladesh is the world\'s eighth-largest remittance recipient (over $21B annually from a large diaspora in the Middle East and UK), and a digital taka with cross-border capability could significantly reduce the fees paid by migrant workers. Bangladesh has also seen rapid growth in mobile financial services (bKash serves 60M+ accounts), creating both infrastructure and competitive considerations for any CBDC design.',
    sourceUrl: 'https://www.bb.org.bd/',
  },
  {
    country: 'Tanzania', flag: '🇹🇿', currency: 'Digital Shilling', status: 'research', type: 'retail', region: 'Africa',
    notes: 'The Bank of Tanzania is studying CBDC options as part of a broader East African digital finance initiative. Tanzania has a relatively advanced mobile money ecosystem (M-Pesa, Airtel Money, Tigo Pesa collectively cover most of the adult population), which frames the key design question: what does a central bank digital currency add beyond what mobile money already provides? The BOT\'s research focuses on interoperability between providers, programmable government payments (subsidies, school fees), and reducing reliance on mobile money operators who charge transaction fees that are high for low-income users.',
    sourceUrl: 'https://www.bot.go.tz/',
  },
  {
    country: 'Qatar', flag: '🇶🇦', currency: 'Digital Riyal', status: 'research', type: 'wholesale', region: 'Middle East',
    notes: 'The Qatar Central Bank is researching wholesale CBDC as part of its Third Financial Sector Strategy (2024–2030). Qatar\'s primary interest is institutional: as a major LNG exporter with $450B+ in sovereign wealth through the QIA, efficient tokenised settlement for energy trade and investment flows would have significant value. Qatar has participated in BIS cross-border wholesale CBDC research and is watching mBridge developments closely. A retail CBDC is not a near-term priority given Qatar\'s very high banking penetration.',
    sourceUrl: 'https://www.qcb.gov.qa/',
  },
  {
    country: 'West Africa (WAEMU)', flag: '🇸🇳', currency: 'e-CFA (Digital Franc)', status: 'research', type: 'retail', region: 'Africa',
    notes: 'The BCEAO (Central Bank of West African States) governs the CFA franc used across eight countries: Senegal, Mali, Burkina Faso, Guinea-Bissau, Ivory Coast, Niger, Togo, and Benin. A CBDC here would be a regional multi-country system similar to DCash in the Eastern Caribbean. The BCEAO published a CBDC study in 2023. The context is politically charged: the CFA franc is pegged to the euro and managed partly by France, and several member states have expressed desire for greater monetary sovereignty — making a sovereign regional digital currency both a financial inclusion tool and a geopolitical symbol.',
    sourceUrl: 'https://www.bceao.int/',
  },
  {
    country: 'Sri Lanka', flag: '🇱🇰', currency: 'Digital Rupee', status: 'research', type: 'retail', region: 'Asia-Pacific',
    notes: 'The Central Bank of Sri Lanka has explored CBDC in the aftermath of the country\'s severe 2022 economic crisis, which saw foreign reserves collapse, the currency lose 80% of its value, and the government default on its debt. In this context, CBDC research has twin goals: improving remittance flows from the Sri Lankan diaspora (critical for FX reserve recovery) and building payment infrastructure resilience. The IMF bailout programme signed in 2023 includes financial sector modernisation conditions.',
    sourceUrl: 'https://www.cbsl.gov.lk/',
  },
  {
    country: 'Ethiopia', flag: '🇪🇹', currency: 'Digital Birr', status: 'research', type: 'retail', region: 'Africa',
    notes: 'The National Bank of Ethiopia published a CBDC discussion paper in 2023 as part of a broader digital economy strategy. Ethiopia is Africa\'s second-most-populous country with one of the lowest banking penetration rates on the continent (under 35%). The NBE has been modernising the banking sector — it opened the sector to private banks and foreign investors for the first time in 2021 — and views CBDC as a leapfrog tool. Ethiopia also launched Telebirr (the state telecoms company\'s mobile money service) which reached 40M users in two years, demonstrating demand for digital payments.',
    sourceUrl: 'https://nbe.gov.et/',
  },
  // ── Cancelled / Inactive ──────────────────────────────────────────────────
  {
    country: 'Ecuador', flag: '🇪🇨', currency: 'Dinero Electrónico', status: 'cancelled', type: 'retail', region: 'Americas', launchYear: 2014,
    notes: 'Ecuador\'s Dinero Electrónico holds the distinction of being the world\'s first government-issued digital currency, launched in 2014 — six years before the Bahamas\' Sand Dollar. It was denominated in US dollars (Ecuador uses the dollar as its currency, having abandoned the sucre in 2000) and operated via mobile phone. Despite early promise, the system was discontinued in 2018 for a combination of reasons: low public trust (many Ecuadorians feared the government could confiscate digital balances, reflecting memories of the 2000 bank crisis), competition from private mobile money, limited merchant acceptance, and inadequate marketing. Its failure is a canonical cautionary tale for CBDC designers — technical capability alone does not drive adoption; trust and incentives matter enormously.',
    sourceUrl: '#',
  },
  {
    country: 'Uruguay', flag: '🇺🇾', currency: 'e-Peso', status: 'cancelled', type: 'retail', region: 'Americas', launchYear: 2017,
    notes: 'Uruguay ran a controlled six-month e-Peso pilot from November 2017 to April 2018, making it one of the very first central banks to distribute actual digital banknotes to real users. The Banco Central del Uruguay issued 20 million digital pesos to approximately 10,000 participants via a smartphone app, with the notes stored on users\' devices and transferable peer-to-peer. The pilot was deemed technically successful but was not extended to a full launch. The BCU concluded that without a compelling use case beyond existing electronic payment methods, a retail CBDC was not justified at that time.',
    sourceUrl: '#',
  },
  {
    country: 'Finland', flag: '🇫🇮', currency: 'Avant', status: 'cancelled', type: 'retail', region: 'Europe', launchYear: 1993,
    notes: 'Finland\'s Avant — issued by the Bank of Finland starting in 1993 — is widely credited as the world\'s first electronic cash system and a direct conceptual ancestor of today\'s CBDCs. It used stored-value smart cards (chip cards) that could hold digital Finnish markka and be used for small purchases without network connectivity. At its peak, several hundred thousand cards were in circulation. Avant was quietly discontinued in 2006 after Finland adopted the euro, and the Bank of Finland concluded the technology was no longer commercially viable relative to evolving card payment infrastructure. It is primarily of historical interest today — a proof of concept for digital central bank money 30 years ahead of the current CBDC wave.',
    sourceUrl: '#',
  },
]

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CbdcStatus, { label: string; color: string; dot: string }> = {
  launched:    { label: 'Launched',    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  pilot:       { label: 'Pilot',       color: 'text-blue-400 bg-blue-400/10 border-blue-500/20',         dot: 'bg-blue-400' },
  development: { label: 'Development', color: 'text-violet-400 bg-violet-400/10 border-violet-500/20',   dot: 'bg-violet-400' },
  research:    { label: 'Research',    color: 'text-amber-400 bg-amber-400/10 border-amber-500/20',      dot: 'bg-amber-400' },
  inactive:    { label: 'Inactive',    color: 'text-slate-400 bg-slate-400/10 border-slate-500/20',      dot: 'bg-slate-500' },
  cancelled:   { label: 'Cancelled',   color: 'text-red-400 bg-red-400/10 border-red-500/20',            dot: 'bg-red-500' },
}

const TYPE_CONFIG: Record<CbdcType, { label: string; color: string }> = {
  retail:    { label: 'Retail',    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-500/20' },
  wholesale: { label: 'Wholesale', color: 'text-purple-400 bg-purple-400/10 border-purple-500/20' },
  both:      { label: 'Both',      color: 'text-teal-400 bg-teal-400/10 border-teal-500/20' },
}

const REGIONS: Region[] = ['Africa', 'Americas', 'Asia-Pacific', 'Europe', 'Middle East']
const STATUSES: CbdcStatus[] = ['launched', 'pilot', 'development', 'research', 'cancelled']

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CbdcStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border', cfg.color)}>
      <span className={clsx('size-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function CountryCard({ entry }: { entry: CbdcEntry }) {
  const [expanded, setExpanded] = useState(false)
  const typeCfg = TYPE_CONFIG[entry.type]

  return (
    <div className="bg-bg-card border border-border rounded-lg overflow-hidden hover:border-accent-blue/30 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <span className="text-2xl leading-none flex-shrink-0">{entry.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-text-primary">{entry.country}</span>
            {expanded ? <ChevronUp size={14} className="text-text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-text-muted flex-shrink-0" />}
          </div>
          <div className="text-xs text-text-muted mt-0.5 truncate">{entry.currency}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <StatusBadge status={entry.status} />
            <span className={clsx('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border', typeCfg.color)}>
              {typeCfg.label}
            </span>
            {entry.launchYear && (
              <span className="text-[10px] text-text-muted self-center">est. {entry.launchYear}</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/40 mt-1">
          <p className="text-xs text-text-secondary leading-relaxed mt-3">{entry.notes}</p>
          {entry.tech && (
            <div className="mt-2 text-[11px] text-text-muted">
              <span className="font-medium text-text-primary">Tech: </span>{entry.tech}
            </div>
          )}
          {entry.sourceUrl !== '#' && (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-[11px] text-accent-blue hover:text-blue-300 transition-colors"
            >
              Central bank source <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CBDC keyword filter ──────────────────────────────────────────────────────

const CBDC_KEYWORDS = /\b(cbdc|central bank digital|digital yuan|e-cny|digital ruble|digital euro|digital dollar|digital pound|digital rupee|digital yen|digital won|digital dirham|digital peso|digital tenge|digital baht|digital shilling|digital rand|e-naira|jam-dex|sand dollar|dcash|drex|digital currency|cbdc pilot|cbdc launch|cbdc rollout|cbdc regulation|cbdc legislation|monetary policy digital|reserve bank digital|bank of england digital|fed digital|ecb digital|rbi digital|pboc digital|mbridge|cross-border cbdc|wholesale cbdc|retail cbdc)\b/i

function filterCbdcNews(articles: LiveNewsArticle[]): LiveNewsArticle[] {
  return articles.filter((a) => {
    const text = `${a.headline} ${a.summary}`
    return (
      CBDC_KEYWORDS.test(text) ||
      a.category === 'global' ||
      (a.category === 'regulation' && /\b(central bank|monetary|federal reserve|ecb|rbi|pboc|boj|boe)\b/i.test(text))
    )
  })
}

// ─── CBDC News Panel ──────────────────────────────────────────────────────────

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-400',
  neutral:  'bg-slate-400',
  negative: 'bg-red-400',
}

function CbdcNewsPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['cbdc-news'],
    queryFn: async () => {
      const res = await fetch('/live-data/news?limit=100')
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ articles: LiveNewsArticle[] }>
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    enabled: LIVE_DATA,
  })

  const articles = data ? filterCbdcNews(data.articles).slice(0, 12) : []

  if (!LIVE_DATA) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-center text-xs text-text-muted">
        CBDC policy updates available in live mode only.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Newspaper size={15} className="text-teal-400" aria-hidden />
        <span className="text-sm font-semibold text-text-primary">CBDC Policy Updates</span>
        <span className="text-[10px] text-text-muted">Live · filters for central bank & CBDC news</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors disabled:opacity-50"
          title="Refresh CBDC news"
        >
          <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 p-6 text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Loading news…</span>
        </div>
      )}

      {!isLoading && articles.length === 0 && (
        <div className="p-6 text-center text-xs text-text-muted">
          No CBDC-related stories in the current feed.
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="divide-y divide-border max-h-96 overflow-y-auto">
          {articles.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2.5 px-4 py-3 hover:bg-bg-elevated transition-colors group"
            >
              <span className={clsx('mt-1.5 size-1.5 rounded-full flex-shrink-0', SENTIMENT_DOT[a.sentiment] ?? 'bg-slate-400')} />
              <div className="min-w-0">
                <p className="text-xs text-text-primary leading-snug line-clamp-2 group-hover:text-teal-400 transition-colors">
                  {a.headline}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-text-muted">{a.source}</span>
                  <span className="text-[10px] text-text-muted/50">·</span>
                  <span className="text-[10px] text-text-muted">
                    {new Date(a.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  {a.category !== 'general' && (
                    <>
                      <span className="text-[10px] text-text-muted/50">·</span>
                      <span className="text-[10px] text-text-muted capitalize">{a.category}</span>
                    </>
                  )}
                </div>
              </div>
              <ExternalLink size={10} className="flex-shrink-0 mt-1 text-text-muted/40 group-hover:text-teal-400/60 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GlobalAdoptionPage() {
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<CbdcStatus | 'all'>('all')

  const { data, isFetching, isError } = useQuery({
    queryKey: ['cbdc-data'],
    queryFn: async () => {
      const res = await fetch('/live-data/cbdc-data')
      if (!res.ok) throw new Error('Failed to fetch CBDC data')
      return res.json() as Promise<CbdcDataResponse>
    },
    staleTime: 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    placeholderData: {
      countries: FALLBACK_DATA,
      source: 'fallback' as const,
      updatedAt: new Date().toISOString(),
      count: FALLBACK_DATA.length,
    },
  })

  const cbdcData = data?.countries ?? FALLBACK_DATA
  const dataSource = data?.source ?? 'fallback'
  const lastUpdated = data?.updatedAt ? new Date(data.updatedAt) : new Date()

  const filtered = cbdcData.filter((e) =>
    (regionFilter === 'all' || e.region === regionFilter) &&
    (statusFilter === 'all' || e.status === statusFilter)
  )

  const byRegion = REGIONS.reduce<Record<string, CbdcEntry[]>>((acc, r) => {
    acc[r] = filtered.filter((e) => e.region === r)
    return acc
  }, {} as Record<string, CbdcEntry[]>)

  // Summary counts from full dataset (not filtered)
  const summary = (Object.keys(STATUS_CONFIG) as CbdcStatus[]).map((s) => ({
    status: s,
    count: cbdcData.filter((e) => e.status === s).length,
  }))

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div>
        <PageHeader
          title="Global Crypto Adoption"
          subtitle={`CBDC status by country — tracking ${cbdcData.length} countries`}
          description="Global Crypto Adoption maps central bank digital currency (CBDC) progress across 70+ countries and regions. Track which nations have launched retail or wholesale CBDCs, which are in pilot or research phases, and which have abandoned their programs."
          details={[
            { label: 'CBDC types', text: 'Retail (consumer-facing) · Wholesale (inter-bank settlements) · Both. Most countries pursuing one or the other.' },
            { label: 'Status stages', text: 'Launched (live to public) · Pilot (limited rollout) · Development (design phase) · Research (feasibility study) · Cancelled (abandoned).' },
            { label: 'Data source', text: `${dataSource === 'live' ? 'Live from Atlantic Council CBDC Tracker' : 'Fallback data'} · updated ${lastUpdated.toLocaleString()}` },
          ]}
        />
      </div>

      {/* Source note */}
      <div className="rounded-xl border border-teal-500/15 bg-teal-500/5 p-3 flex gap-2">
        <Info size={14} className="text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed flex-1">
          {isFetching
            ? <span className="inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin inline" /> Checking for updates…</span>
            : isError
            ? <span className="text-amber-400/90">Could not reach live source — showing cached data.</span>
            : <span>Data source: <span className="font-medium">{dataSource === 'live' ? 'Atlantic Council (live)' : 'Curated dataset'}</span> · {lastUpdated.toLocaleTimeString()}</span>
          }
          {' '}CBDC status changes frequently — verify with{' '}
          <a href="https://www.atlanticcouncil.org/cbdctracker/" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300">
            Atlantic Council CBDC Tracker
          </a>{' '}for current data.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {summary.map(({ status, count }) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
              className={clsx(
                'rounded-lg border p-3 text-center transition-all',
                statusFilter === status ? cfg.color + ' ring-1 ring-current/30' : 'bg-bg-card border-border hover:border-border/80'
              )}
            >
              <div className={clsx('text-2xl font-bold font-mono', statusFilter === status ? '' : 'text-text-primary')}>
                {count}
              </div>
              <div className={clsx('text-[10px] mt-0.5', statusFilter === status ? '' : 'text-text-muted')}>
                {cfg.label}
              </div>
            </button>
          )
        })}
      </div>

      {/* Region filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setRegionFilter('all')}
          className={clsx(
            'px-2.5 py-1 rounded text-xs font-medium border transition-all',
            regionFilter === 'all'
              ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
              : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
          )}
        >
          All Regions
        </button>
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegionFilter(regionFilter === r ? 'all' : r)}
            className={clsx(
              'px-2.5 py-1 rounded text-xs font-medium border transition-all',
              regionFilter === r
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated'
            )}
          >
            {r} ({cbdcData.filter((e) => e.region === r).length})
          </button>
        ))}
      </div>

      {/* CBDC Policy News */}
      <CbdcNewsPanel />

      {/* Cards by region */}
      {REGIONS.filter((r) => byRegion[r].length > 0).map((region) => (
        <section key={region}>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{region}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byRegion[region].map((entry) => (
              <CountryCard key={`${entry.country}-${entry.currency}`} entry={entry} />
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-muted text-sm">
          No countries match the selected filters.
        </div>
      )}
    </div>
  )
}
