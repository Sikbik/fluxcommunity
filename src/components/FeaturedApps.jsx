import React, { useState } from 'react'
import {
  MapGlyph,
  AcademyGlyph,
  GraphGlyph,
  ExternalLinkGlyph,
  ServerGlyph,
  GlobeGlyph,
  AIStarGlyph,
  ReportGlyph,
  CalculatorGlyph
} from './FluxGlyphs'

// App Card Component with Electric Effects
const AppCard = ({ app, index }) => {
  const [isHovered, setIsHovered] = useState(false)

  // Color mapping
  const colorMap = {
    'from-purple-500 to-pink-500': { accent: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)' },
    'from-blue-500 to-cyan-500': { accent: '#22d3ee', glow: 'rgba(34, 211, 238, 0.3)' },
    'from-orange-500 to-red-500': { accent: '#f97316', glow: 'rgba(249, 115, 22, 0.3)' },
    'from-green-500 to-emerald-500': { accent: '#10b981', glow: 'rgba(16, 185, 129, 0.3)' },
    'from-cyan-500 to-blue-500': { accent: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)' },
    'from-emerald-500 to-teal-500': { accent: '#14b8a6', glow: 'rgba(20, 184, 166, 0.3)' },
    'from-indigo-500 to-purple-500': { accent: '#a855f7', glow: 'rgba(168, 85, 247, 0.3)' },
    'from-yellow-500 to-amber-500': { accent: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)' },
    'from-blue-500 to-teal-500': { accent: '#14b8a6', glow: 'rgba(20, 184, 166, 0.3)' }
  }

  const colors = colorMap[app.color] || colorMap['from-blue-500 to-cyan-500']

  return (
    <a
      href={app.link}
      target="_blank"
      rel="noopener noreferrer"
      className="relative rounded-[1.5rem] cursor-pointer group block"
      style={{ animationDelay: `${index * 50}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated border */}
      <div
        className="absolute inset-0 rounded-[1.5rem] transition-all duration-500"
        style={{
          background: `linear-gradient(135deg, ${colors.glow}, transparent 45%, ${colors.glow})`,
          opacity: isHovered ? 1 : 0.35
        }}
      />

      {/* Card content */}
      <div
        className="relative m-[1px] rounded-[1.45rem] p-6 transition-all duration-500 overflow-hidden"
        style={{
          clipPath: 'polygon(0 10px, 10px 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)',
          background: 'linear-gradient(155deg, rgba(8, 13, 28, 0.9) 0%, rgba(15, 23, 42, 0.86) 58%, rgba(7, 9, 20, 0.94) 100%)',
          backdropFilter: 'blur(18px)'
        }}
      >
        <div
          className="absolute inset-0 opacity-35 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(52, 211, 153, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.08) 1px, transparent 1px)',
            backgroundSize: '18px 18px'
          }}
        />

        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px] transition-all duration-300"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            opacity: isHovered ? 1 : 0.3,
            animation: isHovered ? 'circuit-flow 2s linear infinite' : 'none'
          }}
        />


        {/* Header */}
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div
            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${app.color} flex items-center justify-center transform transition-all duration-500 relative ${isHovered ? 'scale-110 -rotate-3' : ''}`}
            style={{
              boxShadow: isHovered ? `0 0 24px ${colors.glow}` : '0 8px 18px rgba(2,6,23,0.55)'
            }}
          >
            <div className="text-white relative z-10 w-6 h-6">
              {app.icon}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status badge with pulse */}
            <span
              className="px-3 py-1 rounded-md text-[10px] tracking-[0.15em] uppercase font-semibold border transition-all duration-300 relative"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                borderColor: `${colors.accent}77`,
                color: isHovered ? colors.accent : '#cbd5e1',
                boxShadow: isHovered ? `0 0 14px ${colors.glow}` : 'none'
              }}
            >
              {isHovered && (
                <span
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-400 animate-[electric-pulse_1s_ease-in-out_infinite]"
                  style={{ boxShadow: '0 0 6px #4ade80' }}
                />
              )}
              <span className={isHovered ? 'pl-3' : ''}>{app.status}</span>
            </span>

            {/* External link icon */}
            <ExternalLinkGlyph className={`w-4 h-4 transition-all duration-300 ${isHovered ? 'text-white translate-x-0.5 -translate-y-0.5' : 'text-slate-400'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 mb-2">
          <span
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{
              color: isHovered ? colors.accent : '#64748b'
            }}
          >
            {app.category}
          </span>
        </div>
        <h3 className={`relative z-10 text-xl font-bold mb-2 transition-all duration-300 ${isHovered ? 'text-white' : 'text-slate-100'}`}>
          {app.name}
        </h3>
        <p className="relative z-10 text-slate-400 text-sm mb-4 leading-relaxed">{app.description}</p>

        <span
          className="relative z-10 inline-flex items-center rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.15em] transition-all duration-300"
          style={{
            color: isHovered ? colors.accent : '#94a3b8',
            borderColor: isHovered ? `${colors.accent}88` : 'rgba(148, 163, 184, 0.25)',
            background: isHovered ? `${colors.accent}1f` : 'rgba(15, 23, 42, 0.35)'
          }}
        >
          Flux Community Build
        </span>

        {/* Bottom energy line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[1px] transition-all duration-500"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${colors.accent}30 50%, transparent 100%)`,
            opacity: isHovered ? 1 : 0
          }}
        />
      </div>

      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-[1.5rem] pointer-events-none transition-all duration-500"
        style={{
          boxShadow: isHovered
            ? `0 0 28px ${colors.glow}, 0 18px 48px rgba(2,6,23,0.62)`
            : '0 4px 16px rgba(2,6,23,0.38)',
          transform: isHovered ? 'translateY(-3px) scale(1.01)' : 'translateY(0) scale(1)'
        }}
      />
    </a>
  )
}

export default function FeaturedApps() {
  const [isCtaHovered, setIsCtaHovered] = useState(false)

  const featuredApps = [
    {
      name: 'Fluxme.io',
      description: 'Community onboarding and discovery hub with Academy tracks, Knowledge Base, FAQ, provider comparisons, and live ecosystem dashboards in English and French',
      category: 'Onboarding',
      icon: <GlobeGlyph className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      status: 'WIP',
      link: 'https://fluxme.io/?utm_source=community'
    },
    {
      name: 'FluxAI',
      description: 'AI-powered assistant for Flux ecosystem built on decentralized infrastructure',
      category: 'AI',
      icon: <AIStarGlyph className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      status: 'Live',
      link: 'https://ai.runonflux.com/?utm_source=community'
    },
    {
      name: 'Flux Atlas',
      description: 'Network infrastructure mapping with detailed node distribution and statistics',
      category: 'Infrastructure',
      icon: <MapGlyph className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      status: 'Live',
      link: 'https://atlas.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Academy',
      description: 'Interactive learning platform for Flux blockchain and FluxNode operations',
      category: 'Education',
      icon: <AcademyGlyph className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      status: 'Live',
      link: 'https://academy.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'FluxNode Dashboard',
      description: 'Track block rewards and parallel asset rewards with real-time monitoring',
      category: 'Infrastructure',
      icon: <GraphGlyph className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
      status: 'Live',
      link: 'https://fluxnode.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Tracker',
      description: 'Application revenue and network analytics for the Flux ecosystem',
      category: 'Analytics',
      icon: <ReportGlyph className="w-6 h-6" />,
      color: 'from-cyan-500 to-blue-500',
      status: 'Live',
      link: 'https://fluxtracker.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'FluxNode Calculator',
      description: 'Calculate post-fork PoN rewards in comparison to pre-PoN earnings',
      category: 'Tools',
      icon: <CalculatorGlyph className="w-6 h-6" />,
      color: 'from-emerald-500 to-teal-500',
      status: 'Live',
      link: 'https://fluxnodecalc.app.runonflux.io/?utm_source=community'
    },
    {
      name: 'Flux Runner',
      description: 'Managed WordPress hosting solution powered by Flux decentralized infrastructure',
      category: 'Hosting',
      icon: <GlobeGlyph className="w-6 h-6" />,
      color: 'from-indigo-500 to-purple-500',
      status: 'Live',
      link: 'https://fluxrunner.com/?utm_source=community'
    },
    {
      name: 'GoldieTech Nodes',
      description: 'Professional FluxNode hosting and management services',
      category: 'Hosting',
      icon: <ServerGlyph className="w-6 h-6" />,
      color: 'from-yellow-500 to-amber-500',
      status: 'Live',
      link: 'https://goldietechnodes.com/?utm_source=community'
    },
    {
      name: 'Node Orbit',
      description: 'A Distributed Node Hosting Platform',
      category: 'Hosting',
      icon: <ServerGlyph className="w-6 h-6" />,
      color: 'from-blue-500 to-teal-500',
      status: 'Live',
      link: 'https://nodeorbit.com/?utm_source=community'
    }
  ]

  return (
    <section className="py-20 px-4 relative overflow-hidden section-surface">
      {/* Background circuit pattern */}
      <div className="absolute inset-0 grid-overlay opacity-30" />

      {/* Decorative energy lines */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

      {/* Section background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            <span className="electric-text">Featured Applications</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
            Community-built applications powering the{' '}
            <span className="text-cyan-400 text-glow-cyan">Flux ecosystem</span>
          </p>

          {/* Decorative line under title */}
          <div className="mt-6 flex justify-center">
            <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent animate-[circuit-flow_3s_linear_infinite]" />
          </div>
        </div>

        {/* Apps Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredApps.map((app, index) => (
            <AppCard key={index} app={app} index={index} />
          ))}
        </div>

        {/* Submit Your App CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <div
            className="relative rounded-[1.6rem] max-w-2xl mx-auto overflow-hidden"
            onMouseEnter={() => setIsCtaHovered(true)}
            onMouseLeave={() => setIsCtaHovered(false)}
          >
            {/* Animated border */}
            <div
              className="absolute inset-0 rounded-[1.6rem] transition-opacity duration-500"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.7), transparent, rgba(168, 85, 247, 0.7), transparent)',
                animation: isCtaHovered ? 'plasma-flow 3s ease-in-out infinite' : 'none',
                opacity: isCtaHovered ? 1 : 0.45
              }}
            />

            {/* CTA Content */}
            <div
              className="relative m-[1px] rounded-[1.55rem] p-6 sm:p-8 overflow-hidden"
              style={{
                clipPath: 'polygon(0 10px, 10px 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)',
                background: 'linear-gradient(145deg, rgba(11, 17, 34, 0.93), rgba(10, 16, 31, 0.9))',
                backdropFilter: 'blur(20px)'
              }}
            >
              <div
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(96, 165, 250, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(96, 165, 250, 0.1) 1px, transparent 1px)',
                  backgroundSize: '20px 20px'
                }}
              />

              {/* Animated top line */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent"
                style={{ animation: isCtaHovered ? 'circuit-flow 2s linear infinite' : 'none' }}
              />

              <h3 className="relative z-10 text-xl sm:text-2xl font-bold mb-3">
                <span className={isCtaHovered ? 'text-white' : 'text-slate-100'}>Built Something Amazing?</span>
              </h3>
              <p className="relative z-10 text-sm sm:text-base text-slate-300 mb-6 leading-relaxed">
                Submit your application to be featured in the Flux Community portal.
                Join our Discord and ping <span className="text-cyan-400">@bigstache</span> with your app details.
              </p>
              <a
                href="https://discord.com/invite/runonflux"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-electric inline-block w-full sm:w-auto px-6 py-3 rounded-lg font-semibold"
              >
                <span className="relative z-10 flex items-center justify-center gap-2 tracking-wide">
                  Submit Your App
                </span>
              </a>
            </div>

            {/* Outer glow */}
            <div
              className="absolute inset-0 rounded-[1.6rem] pointer-events-none transition-all duration-500"
              style={{
                boxShadow: isCtaHovered
                  ? '0 0 44px rgba(59, 130, 246, 0.35), 0 20px 60px rgba(2, 6, 23, 0.65)'
                  : '0 6px 24px rgba(2, 6, 23, 0.45)'
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
