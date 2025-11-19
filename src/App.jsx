import React, { useState, useEffect } from 'react'
import {
  Blocks,
  Rocket,
  Users,
  BookOpen,
  Code,
  Globe,
  Zap,
  ExternalLink,
  Github,
  X,
  MessageCircle,
  ChevronDown,
  Sparkles,
  Network,
  Database,
  Shield,
  Cloud,
  Wallet
} from 'lucide-react'
import Hero from './components/Hero'
import EcosystemCard from './components/EcosystemCard'
import FeaturedApps from './components/FeaturedApps'
import Resources from './components/Resources'
import Footer from './components/Footer'

function App() {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const ecosystemProjects = [
    {
      title: 'Cloud',
      description: 'Deploy and manage decentralized applications on Flux network with our intuitive deployment portal.',
      icon: <Cloud className="w-8 h-8" />,
      link: 'https://cloud.runonflux.com/?utm_source=community',
      color: 'from-blue-500 to-cyan-500',
      features: ['App Deployment', 'Container Management', 'Scaling Tools', 'Resource Monitoring']
    },
    {
      title: 'Explorer',
      description: 'Real-time blockchain explorer with advanced analytics, FluxNode tracking, and rich list features.',
      icon: <Blocks className="w-8 h-8" />,
      link: 'https://explorer.runonflux.io/?utm_source=community',
      color: 'from-indigo-500 to-purple-500',
      features: ['Block Explorer', 'Transaction Tracking', 'Address Analytics', 'Rich List']
    },
    {
      title: 'Edge AI',
      description: 'High-performance AI inference platform powered by Flux decentralized GPU infrastructure.',
      icon: <Zap className="w-8 h-8" />,
      link: 'https://console.fluxedge.ai/?utm_source=community',
      color: 'from-purple-500 to-pink-500',
      features: ['GPU Computing', 'AI Inference', 'Model Deployment', 'Decentralized Processing']
    },
    {
      title: 'Academy',
      description: 'Learn how to build and deploy applications on Flux through hands-on tutorials and interactive guides.',
      icon: <BookOpen className="w-8 h-8" />,
      link: 'https://academy.app.runonflux.io/?utm_source=community',
      color: 'from-orange-500 to-red-500',
      features: ['Tutorials', 'Documentation', 'Deployment Playground', 'Interactive Learning']
    }
  ]

  return (
    <div className="min-h-screen gradient-bg">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Hero />

        {/* Ecosystem Section */}
        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="gradient-text">Explore the Ecosystem</span>
              </h2>
              <p className="text-xl text-slate-300 max-w-3xl mx-auto">
                Discover powerful tools and applications built on Flux blockchain
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {ecosystemProjects.map((project, index) => (
                <EcosystemCard
                  key={index}
                  {...project}
                  delay={index * 100}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Wallets Section */}
        <section className="py-20 px-4 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
                <span className="gradient-text">Flux Wallets</span>
              </h2>
              <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
                Secure and manage your Flux assets with official wallet solutions
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
              {/* Zelcore */}
              <a
                href="https://zelcore.io/?utm_source=community"
                target="_blank"
                rel="noopener noreferrer"
                className="glass rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-all duration-300 group cursor-pointer transform hover:scale-105"
              >
                <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-2.5 sm:p-3 transform transition-transform group-hover:rotate-6">
                    <Wallet className="w-full h-full text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">Zelcore</h3>
                    <p className="text-slate-400 text-xs sm:text-sm">Multi-Asset Wallet</p>
                  </div>
                </div>
                <p className="text-sm sm:text-base text-slate-300 mb-4">
                  Feature-rich multi-cryptocurrency wallet with built-in exchange, staking, and comprehensive asset management.
                </p>
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm sm:text-base">
                  <span>Learn More</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
              </a>

              {/* SSP Wallet */}
              <a
                href="https://sspwallet.io/?utm_source=community"
                target="_blank"
                rel="noopener noreferrer"
                className="glass rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-all duration-300 group cursor-pointer transform hover:scale-105"
              >
                <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-2.5 sm:p-3 transform transition-transform group-hover:rotate-6">
                    <Wallet className="w-full h-full text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">SSP Wallet</h3>
                    <p className="text-slate-400 text-xs sm:text-sm">Enterprise Multisig Security</p>
                  </div>
                </div>
                <p className="text-sm sm:text-base text-slate-300 mb-4">
                  Enterprise-grade wallet with multisignature security, self-sovereign protocol, and advanced privacy features for institutional and individual users.
                </p>
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm sm:text-base">
                  <span>Learn More</span>
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Featured Community Apps */}
        <FeaturedApps />

        {/* Resources */}
        <Resources />

        {/* CTA Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="glass rounded-3xl p-8 sm:p-12 animate-glow">
              <Sparkles className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-6 text-yellow-400" />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Join the Flux Community
              </h2>
              <p className="text-lg sm:text-xl text-slate-300 mb-8">
                Be part of the decentralized cloud revolution
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
                <a
                  href="https://discord.com/invite/runonflux"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass hover:bg-white/10 transition-all px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <MessageCircle className="w-5 h-5" />
                  Discord
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href="https://x.com/RunOnFlux"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass hover:bg-white/10 transition-all px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <X className="w-5 h-5" />
                  Official X
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href="https://x.com/i/communities/1783579310768411056"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass hover:bg-white/10 transition-all px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <Users className="w-5 h-5" />
                  X Community
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href="https://github.com/RunOnFlux"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass hover:bg-white/10 transition-all px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <Github className="w-5 h-5" />
                  GitHub
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  )
}

export default App
