import React from 'react'
import { Map, GraduationCap, LineChart, ExternalLink, TrendingUp, Server, Globe, Sparkles, BarChart3, Calculator } from 'lucide-react'

export default function FeaturedApps() {
  const featuredApps = [
    {
      name: 'FluxAI',
      description: 'AI-powered assistant for Flux ecosystem built on decentralized infrastructure',
      category: 'AI',
      icon: <Sparkles className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      status: 'Live',
      link: 'https://ai.runonflux.com/?utm_source=community'
    },
    {
      name: 'DAA Flux',
      description: 'Difficulty Adjustment Algorithm monitoring and analysis for Flux blockchain',
      category: 'Infrastructure',
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      status: 'Live',
      link: 'https://daaflux.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Atlas',
      description: 'Network infrastructure mapping with detailed node distribution and statistics',
      category: 'Infrastructure',
      icon: <Map className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      status: 'Live',
      link: 'https://atlas.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Academy',
      description: 'Interactive learning platform for Flux blockchain and FluxNode operations',
      category: 'Education',
      icon: <GraduationCap className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      status: 'Live',
      link: 'https://academy.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'FluxNode Dashboard',
      description: 'Track block rewards and parallel asset rewards with real-time monitoring',
      category: 'Infrastructure',
      icon: <LineChart className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
      status: 'Live',
      link: 'https://fluxnode.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Tracker',
      description: 'Application revenue and network analytics for the Flux ecosystem',
      category: 'Analytics',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'from-cyan-500 to-blue-500',
      status: 'Live',
      link: 'https://fluxtracker.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'FluxNode Calculator',
      description: 'Calculate post-fork PoN rewards in comparison to pre-PoN earnings',
      category: 'Tools',
      icon: <Calculator className="w-6 h-6" />,
      color: 'from-emerald-500 to-teal-500',
      status: 'Live',
      link: 'https://fluxnodecalc.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Runner',
      description: 'Managed WordPress hosting solution powered by Flux decentralized infrastructure',
      category: 'Hosting',
      icon: <Globe className="w-6 h-6" />,
      color: 'from-indigo-500 to-purple-500',
      status: 'Live',
      link: 'https://fluxrunner.com/?utm_source=community'
    },
    {
      name: 'GoldieTech Nodes',
      description: 'Professional FluxNode hosting and management services',
      category: 'Hosting',
      icon: <Server className="w-6 h-6" />,
      color: 'from-yellow-500 to-amber-500',
      status: 'Live',
      link: 'https://goldietechnodes.com/?utm_source=community'
    },
    {
      name: 'Node Orbit',
      description: 'A Distributed Node Hosting Platform',
      category: 'Hosting',
      icon: <Server className="w-6 h-6" />,
      color: 'from-blue-500 to-teal-500',
      status: 'Live',
      link: 'https://nodeorbit.com/?utm_source=community'
    }
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'Live':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'Beta':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'Coming Soon':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
    }
  }

  return (
    <section className="py-20 px-4 bg-black/20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Featured Applications</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
            Community-built applications powering the Flux ecosystem
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredApps.map((app, index) => (
            <a
              key={index}
              href={app.link}
              target="_blank"
              rel="noopener noreferrer"
              className="glass rounded-xl p-6 hover:bg-white/10 transition-all duration-300 group cursor-pointer transform hover:scale-105"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${app.color} p-2.5 transform transition-transform group-hover:rotate-6`}>
                  <div className="text-white">
                    {app.icon}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(app.status)}`}>
                    {app.status}
                  </span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold mb-2">{app.name}</h3>
              <p className="text-slate-400 text-sm mb-3">{app.description}</p>
              <span className="text-xs text-slate-500 uppercase tracking-wider">{app.category}</span>
            </a>
          ))}
        </div>

        {/* Submit Your App CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <div className="glass rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto">
            <h3 className="text-xl sm:text-2xl font-bold mb-3">Built Something Amazing?</h3>
            <p className="text-sm sm:text-base text-slate-300 mb-6">
              Submit your application to be featured in the Flux Community portal. Join our Discord and ping @bigstache with your app details.
            </p>
            <a
              href="https://discord.com/invite/runonflux"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full sm:w-auto bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transition-all px-6 py-3 rounded-lg font-semibold"
            >
              Submit Your App
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
