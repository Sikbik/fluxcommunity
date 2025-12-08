import React, { useState, useEffect } from 'react'
import { Activity } from 'iconoir-react'

// Stat Item Component
const StatItem = ({ value, label, color, isLoading }) => {
  const colorClasses = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    pink: 'text-pink-400',
    green: 'text-emerald-400',
    cyan: 'text-cyan-400'
  }

  return (
    <div className="relative group">
      <div className={`text-2xl md:text-3xl font-bold ${colorClasses[color]} transition-all`}>
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <Activity className="w-5 h-5 animate-pulse" strokeWidth={2} />
            <span className="animate-pulse">...</span>
          </span>
        ) : (
          <span>{value}</span>
        )}
      </div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
    </div>
  )
}

// Flux Capacitor Logo Component with Electric Effects (GPU Optimized)
const FluxCapacitorLogo = () => (
  <div
    className="relative w-44 h-44 md:w-56 md:h-56 flex items-center justify-center"
    style={{ perspective: '800px', transformStyle: 'preserve-3d', willChange: 'transform' }}
  >
    {/* Ambient glow behind everything - simplified */}
    <div
      className="absolute inset-[-20px] rounded-full opacity-50"
      style={{
        background: 'radial-gradient(circle, rgba(34, 211, 238, 0.25) 0%, rgba(168, 85, 247, 0.15) 40%, transparent 70%)',
        transform: 'translateZ(0)'
      }}
    />

    {/* Chaotic Lightning Bolts */}
    <svg className="absolute inset-[-35px] md:inset-[-45px] w-[calc(100%+70px)] h-[calc(100%+70px)] md:w-[calc(100%+90px)] md:h-[calc(100%+90px)]" viewBox="0 0 200 200" fill="none">
      <defs>
        <linearGradient id="bolt-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="30%" stopColor="#22d3ee" stopOpacity="1" />
          <stop offset="70%" stopColor="#22d3ee" stopOpacity="1" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bolt-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
          <stop offset="30%" stopColor="#a855f7" stopOpacity="1" />
          <stop offset="70%" stopColor="#a855f7" stopOpacity="1" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bolt-pink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" stopOpacity="0" />
          <stop offset="30%" stopColor="#ec4899" stopOpacity="1" />
          <stop offset="70%" stopColor="#ec4899" stopOpacity="1" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bolt-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="30%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="70%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Wild lightning bolt 1 - top left, jagged */}
      <path
        className="animate-lightning-1"
        d="M45 15 L52 28 L44 32 L58 45 L48 48 L62 65 L50 62 L55 75"
        stroke="url(#bolt-cyan)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 2 - top right, branching */}
      <path
        className="animate-lightning-2"
        d="M155 20 L148 35 L156 38 L142 52 L152 55 L138 72"
        stroke="url(#bolt-purple)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        className="animate-lightning-2"
        d="M148 35 L160 42 L154 55"
        stroke="url(#bolt-purple)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.7"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 3 - bottom right, erratic */}
      <path
        className="animate-lightning-3"
        d="M165 145 L152 138 L158 130 L140 125 L148 118 L132 108"
        stroke="url(#bolt-pink)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        className="animate-lightning-3"
        d="M152 138 L162 128 L155 120"
        stroke="url(#bolt-pink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 4 - bottom left, zigzag */}
      <path
        className="animate-lightning-4"
        d="M35 155 L48 145 L40 138 L56 128 L45 122 L60 110 L52 105"
        stroke="url(#bolt-blue)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 5 - top center, forked */}
      <path
        className="animate-lightning-5"
        d="M100 8 L95 22 L102 25 L92 38 L100 42 L88 58"
        stroke="url(#bolt-cyan)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        className="animate-lightning-5"
        d="M95 22 L105 30 L98 42"
        stroke="url(#bolt-cyan)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.6"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 6 - bottom center */}
      <path
        className="animate-lightning-6"
        d="M100 192 L105 178 L98 174 L108 160 L100 156 L112 142"
        stroke="url(#bolt-purple)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 7 - left side */}
      <path
        className="animate-lightning-7"
        d="M8 100 L22 95 L18 102 L35 94 L30 104 L48 98"
        stroke="url(#bolt-pink)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <path
        className="animate-lightning-7"
        d="M22 95 L28 88 L38 92"
        stroke="url(#bolt-pink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
        filter="url(#glow)"
      />

      {/* Wild lightning bolt 8 - right side */}
      <path
        className="animate-lightning-8"
        d="M192 100 L178 105 L182 98 L165 106 L170 96 L152 102"
        stroke="url(#bolt-blue)"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />
    </svg>

    {/* 3D Orbit Container */}
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ perspective: '600px', transformStyle: 'preserve-3d' }}
    >
      {/* Orbit path indicators (subtle ellipses) */}
      <div
        className="absolute w-[180px] h-[180px] md:w-[220px] md:h-[220px] rounded-full border border-cyan-500/25"
        style={{ transform: 'rotateZ(-20deg) rotateX(70deg)' }}
      />
      <div
        className="absolute w-[240px] h-[240px] md:w-[290px] md:h-[290px] rounded-full border border-purple-500/20"
        style={{ transform: 'rotateZ(50deg) rotateX(70deg)' }}
      />
      <div
        className="absolute w-[300px] h-[300px] md:w-[360px] md:h-[360px] rounded-full border border-amber-500/15"
        style={{ transform: 'rotateZ(-40deg) rotateX(70deg)' }}
      />

      {/* Orbit Ring 1 - Cumulus (cyan) - closest/fastest */}
      <div
        className="absolute w-[180px] h-[180px] md:w-[220px] md:h-[220px] animate-orbit-1"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          {/* Trail */}
          <div
            className="absolute top-0 right-full w-10 h-2 rounded-full opacity-60"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'linear-gradient(90deg, transparent 0%, #22d3ee 100%)',
              marginRight: '-2px'
            }}
          />
          {/* Electron */}
          <div
            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'radial-gradient(circle, #ffffff 0%, #22d3ee 50%, #0891b2 100%)',
              boxShadow: '0 0 8px #22d3ee, 0 0 16px rgba(34, 211, 238, 0.5)'
            }}
          />
        </div>
      </div>

      {/* Orbit Ring 2 - Nimbus (purple) - middle */}
      <div
        className="absolute w-[240px] h-[240px] md:w-[290px] md:h-[290px] animate-orbit-2"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          {/* Trail */}
          <div
            className="absolute top-0 right-full w-12 h-2.5 rounded-full opacity-50"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'linear-gradient(90deg, transparent 0%, #a855f7 100%)',
              marginRight: '-3px'
            }}
          />
          {/* Electron */}
          <div
            className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'radial-gradient(circle, #ffffff 0%, #a855f7 50%, #7c3aed 100%)',
              boxShadow: '0 0 10px #a855f7, 0 0 20px rgba(168, 85, 247, 0.5)'
            }}
          />
        </div>
      </div>

      {/* Orbit Ring 3 - Stratus (pink/gold) - furthest/slowest - COUNTER-CLOCKWISE */}
      <div
        className="absolute w-[300px] h-[300px] md:w-[360px] md:h-[360px] animate-orbit-3"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          {/* Electron */}
          <div
            className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'radial-gradient(circle, #ffffff 0%, #f59e0b 40%, #ec4899 100%)',
              boxShadow: '0 0 10px #f59e0b, 0 0 20px rgba(236, 72, 153, 0.5)'
            }}
          />
          {/* Trail */}
          <div
            className="absolute top-0 left-full w-14 h-3 rounded-full opacity-40"
            style={{
              transform: 'translateY(-35%) translateZ(0)',
              background: 'linear-gradient(90deg, #f59e0b 0%, transparent 100%)',
              marginLeft: '-3px'
            }}
          />
        </div>
      </div>
    </div>

    {/* The Logo - Nucleus (optimized) */}
    <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center z-10">
      {/* Nucleus glow - single element, no blur filter */}
      <div
        className="absolute inset-[-10px] rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(34, 211, 238, 0.4) 0%, rgba(168, 85, 247, 0.2) 50%, transparent 70%)',
          transform: 'translateZ(0)'
        }}
      />
      {/* Logo */}
      <img
        src="/favicon.svg"
        alt="Flux Logo"
        className="w-full h-full relative z-10"
        style={{
          filter: 'drop-shadow(0 0 10px rgba(34, 211, 238, 0.5))',
          transform: 'translateZ(0)'
        }}
      />
    </div>
  </div>
)

export default function Hero() {
  const [fluxNodeCount, setFluxNodeCount] = useState(null)
  const [blockHeight, setBlockHeight] = useState(null)

  useEffect(() => {
    const fetchFluxNodeCount = async () => {
      try {
        const response = await fetch('https://api.runonflux.io/daemon/getzelnodecount')
        const data = await response.json()
        if (data.status === 'success' && data.data?.total) {
          setFluxNodeCount(data.data.total.toLocaleString())
        }
      } catch (error) {
        console.error('Error fetching FluxNode count:', error)
      }
    }

    const fetchBlockHeight = async () => {
      try {
        const response = await fetch('https://api.runonflux.io/daemon/getblockcount')
        const data = await response.json()
        if (data.status === 'success' && data.data) {
          const height = data.data
          const formattedHeight = height >= 1000000
            ? `${(height / 1000000).toFixed(2)}M`
            : `${(height / 1000).toFixed(1)}K`
          setBlockHeight(formattedHeight)
        }
      } catch (error) {
        // Silently fail
      }
    }

    fetchFluxNodeCount()
    fetchBlockHeight()

    const interval = setInterval(() => {
      fetchFluxNodeCount()
      fetchBlockHeight()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const scrollToContent = () => {
    window.scrollTo({
      top: window.innerHeight - 100,
      behavior: 'smooth'
    })
  }

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden pb-32">
      {/* Grid overlay */}
      <div className="absolute inset-0 grid-overlay opacity-30" />

      {/* Flux Capacitor Logo - extra padding for orbiting nodes */}
      <div className="mb-4 md:mb-6 animate-float relative z-10 pb-12 md:pb-16">
        <FluxCapacitorLogo />
      </div>

      {/* Portal Label */}
      <div className="mono-label mb-3 relative z-10">// community portal</div>

      {/* Main Title */}
      <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black text-center mb-4 relative z-10 px-2">
        <span className="electric-text-chrome" data-text="Flux Community">
          Flux Community
        </span>
      </h1>

      {/* Subtitle */}
      <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-center mb-3 max-w-4xl relative z-10 px-4">
        <span className="text-slate-300 font-medium">Your Gateway to the</span>{' '}
        <span className="text-cyan-400 font-semibold">Decentralized World</span>
      </p>

      {/* Description */}
      <p className="text-sm sm:text-base md:text-lg text-slate-400 text-center mb-8 max-w-2xl relative z-10 px-4">
        Explore blockchain tools, learn from the academy, and discover community-built applications
        powering the{' '}
        <span className="text-purple-400">Flux ecosystem</span>.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 mb-8 w-full max-w-md sm:max-w-none justify-center relative z-10">
        <button
          onClick={scrollToContent}
          className="btn-electric px-8 py-4 rounded-xl font-semibold text-lg inline-flex items-center justify-center group"
        >
          Explore Ecosystem
        </button>
        <a
          href="https://runonflux.io"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-neon px-8 py-4 rounded-xl font-semibold text-lg text-center"
        >
          Official Website
        </a>
      </div>

      {/* Stats Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="glass-electric rounded-2xl p-6 relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center relative">
              <StatItem
                value={fluxNodeCount}
                label="Active FluxNodes"
                color="blue"
                isLoading={!fluxNodeCount}
              />
              <StatItem
                value={blockHeight}
                label="Blocks Mined"
                color="purple"
                isLoading={!blockHeight}
              />
              <StatItem
                value="24/7"
                label="Network Uptime"
                color="cyan"
                isLoading={false}
              />
              <StatItem
                value="Global"
                label="Community"
                color="green"
                isLoading={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
