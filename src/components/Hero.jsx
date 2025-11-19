import React, { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function Hero() {
  const [fluxNodeCount, setFluxNodeCount] = useState(null)
  const [blockHeight, setBlockHeight] = useState(null)

  useEffect(() => {
    // Fetch FluxNode count
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

    // Fetch block height from daemon API
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
        // Silently fail - block height will show "Loading..."
      }
    }

    fetchFluxNodeCount()
    fetchBlockHeight()

    // Refresh data every 60 seconds
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
    <section className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Flux Logo */}
      <div className="mb-8 animate-float">
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 p-1">
          <div className="w-full h-full rounded-full bg-flux-darker flex items-center justify-center p-1">
            <img src="/favicon.svg" alt="Flux Logo" className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* Main Title */}
      <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-center mb-6">
        <span className="gradient-text">Flux Community</span>
      </h1>

      {/* Subtitle */}
      <p className="text-xl md:text-2xl lg:text-3xl text-slate-300 text-center mb-4 max-w-4xl">
        Your Gateway to the Decentralized Cloud
      </p>

      {/* Description */}
      <p className="text-lg md:text-xl text-slate-400 text-center mb-12 max-w-3xl">
        Explore blockchain tools, learn from the academy, and discover community-built applications
        powering the Flux ecosystem.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 mb-16 w-full max-w-md sm:max-w-none justify-center">
        <button
          onClick={scrollToContent}
          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transition-all px-8 py-4 rounded-xl font-semibold text-lg shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-105 transform"
        >
          Explore Ecosystem
        </button>
        <a
          href="https://runonflux.io"
          target="_blank"
          rel="noopener noreferrer"
          className="glass hover:bg-white/10 transition-all px-8 py-4 rounded-xl font-semibold text-lg text-center"
        >
          Official Website
        </a>
      </div>

      {/* Scroll Indicator */}
      <button
        onClick={scrollToContent}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce cursor-pointer"
      >
        <ChevronDown className="w-8 h-8 text-slate-400" />
      </button>

      {/* Stats Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div className="max-w-7xl mx-auto glass rounded-2xl p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl md:text-3xl font-bold text-blue-400">
                {fluxNodeCount || <span className="animate-pulse">Loading...</span>}
              </div>
              <div className="text-sm text-slate-400">Active FluxNodes</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-purple-400">
                {blockHeight || <span className="animate-pulse">Loading...</span>}
              </div>
              <div className="text-sm text-slate-400">Blocks Mined</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-pink-400">24/7</div>
              <div className="text-sm text-slate-400">Network Uptime</div>
            </div>
            <div>
              <div className="text-2xl md:text-3xl font-bold text-green-400">Global</div>
              <div className="text-sm text-slate-400">Community</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
