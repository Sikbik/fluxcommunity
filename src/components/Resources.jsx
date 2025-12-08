import React, { useState } from 'react'
import { Book, Code, MediaVideoList, ChatBubble, OpenNewWindow } from 'iconoir-react'

// Resource Link Component
const ResourceLink = ({ name, url, description, accent }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative rounded-lg overflow-hidden transition-all duration-300"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          background: isHovered ? `rgba(${accent}, 0.1)` : 'rgba(255, 255, 255, 0.03)',
        }}
      />

      {/* Left accent line */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px] transition-all duration-300"
        style={{
          background: isHovered
            ? `linear-gradient(180deg, transparent, rgb(${accent}), transparent)`
            : 'transparent',
          boxShadow: isHovered ? `0 0 10px rgba(${accent}, 0.5)` : 'none'
        }}
      />

      {/* Content */}
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="font-semibold mb-1 flex items-center gap-2 transition-all duration-300">
              <span
                style={{
                  color: isHovered ? `rgb(${accent})` : 'white',
                  textShadow: isHovered ? `0 0 10px rgba(${accent}, 0.5)` : 'none'
                }}
              >
                {name}
              </span>
              <OpenNewWindow
                className={`w-4 h-4 transition-all duration-300 ${isHovered ? 'translate-x-1 -translate-y-1' : ''}`}
                style={{ color: isHovered ? `rgb(${accent})` : '#94a3b8' }}
                strokeWidth={2}
              />
            </div>
            <div className="text-sm text-slate-400">{description}</div>
          </div>
        </div>
      </div>
    </a>
  )
}

// Resource Card Component
const ResourceCard = ({ category, icon, color, links, accentRgb }) => {
  const [isHovered, setIsHovered] = useState(false)

  const colorMap = {
    'from-blue-500 to-cyan-500': { accent: '#22d3ee', glow: 'rgba(34, 211, 238, 0.3)', rgb: '34, 211, 238' },
    'from-purple-500 to-pink-500': { accent: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)', rgb: '236, 72, 153' },
    'from-orange-500 to-red-500': { accent: '#f97316', glow: 'rgba(249, 115, 22, 0.3)', rgb: '249, 115, 22' },
    'from-green-500 to-emerald-500': { accent: '#10b981', glow: 'rgba(16, 185, 129, 0.3)', rgb: '16, 185, 129' }
  }

  const colors = colorMap[color] || colorMap['from-blue-500 to-cyan-500']

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated border */}
      <div
        className="absolute inset-0 rounded-2xl transition-all duration-500"
        style={{
          background: `linear-gradient(135deg, ${colors.glow}, transparent, ${colors.glow})`,
          opacity: isHovered ? 1 : 0.2
        }}
      />

      {/* Card content */}
      <div
        className="relative m-[2px] rounded-2xl p-6 sm:p-8 transition-all duration-500"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] transition-all duration-300"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            animation: isHovered ? 'circuit-flow 2s linear infinite' : 'none',
            opacity: isHovered ? 1 : 0.3
          }}
        />


        {/* Category Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 relative">
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center transform transition-all duration-300 relative ${isHovered ? 'scale-105' : ''}`}
          >
            <div className="text-white relative z-10 w-5 h-5 sm:w-6 sm:h-6">
              {icon}
            </div>
          </div>
          <h3
            className="text-xl sm:text-2xl font-bold transition-all duration-300"
            style={{
              color: isHovered ? 'white' : '#f1f5f9',
              textShadow: isHovered ? `0 0 20px ${colors.glow}` : 'none'
            }}
          >
            {category}
          </h3>
        </div>

        {/* Links */}
        {category === 'Community' ? (
          <div className="space-y-4">
            {/* Discord and Telegram - Full Width */}
            {links.slice(0, 2).map((link, linkIndex) => (
              <ResourceLink
                key={linkIndex}
                {...link}
                accent={colors.rgb}
              />
            ))}
            {/* X Links - Side by Side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {links.slice(2).map((link, linkIndex) => (
                <ResourceLink
                  key={linkIndex + 2}
                  {...link}
                  accent={colors.rgb}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {links.map((link, linkIndex) => (
              <ResourceLink
                key={linkIndex}
                {...link}
                accent={colors.rgb}
              />
            ))}
          </div>
        )}

        {/* Bottom power line */}
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
        className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-500"
        style={{
          boxShadow: isHovered
            ? `0 0 30px ${colors.glow}, 0 10px 40px rgba(0,0,0,0.4)`
            : '0 4px 20px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  )
}

export default function Resources() {
  const resources = [
    {
      category: 'Documentation',
      icon: <Book className="w-6 h-6" strokeWidth={1.5} />,
      color: 'from-blue-500 to-cyan-500',
      links: [
        { name: 'Official Flux Docs', url: 'https://docs.runonflux.com/', description: 'Complete technical documentation' },
        { name: 'FluxNode Setup Guide', url: 'https://docs.runonflux.com/fluxnodes/what-are-fluxnodes', description: 'Step-by-step node installation' },
        { name: 'API Documentation', url: 'https://docs.runonflux.io/fluxapi', description: 'Flux API reference and endpoints' },
      ]
    },
    {
      category: 'Developer Resources',
      icon: <Code className="w-6 h-6" strokeWidth={2} />,
      color: 'from-purple-500 to-pink-500',
      links: [
        { name: 'RunOnFlux GitHub', url: 'https://github.com/RunOnFlux', description: 'Main organization repository' },
        { name: 'Flux (FluxOS)', url: 'https://github.com/runonflux/flux', description: 'Flux decentralized OS' },
        { name: 'Fluxd', url: 'https://github.com/runonflux/fluxd', description: 'Flux blockchain daemon' },
      ]
    },
    {
      category: 'Learning Materials',
      icon: <MediaVideoList className="w-6 h-6" strokeWidth={1.5} />,
      color: 'from-orange-500 to-red-500',
      links: [
        { name: 'YouTube Channel', url: 'https://www.youtube.com/@runonflux_official', description: 'Video tutorials and updates' },
        { name: 'Flux Academy', url: 'https://academy.app.runonflux.io/', description: 'Interactive learning platform' },
        { name: 'Blog & Articles', url: 'https://runonflux.com/blog/', description: 'Latest news and insights' },
      ]
    },
    {
      category: 'Community',
      icon: <ChatBubble className="w-6 h-6" strokeWidth={1.5} />,
      color: 'from-green-500 to-emerald-500',
      links: [
        { name: 'Discord Server', url: 'https://discord.com/invite/runonflux', description: 'Join the conversation' },
        { name: 'Telegram Group', url: 'https://t.me/runonflux', description: 'Real-time community chat' },
        { name: 'Official Flux X', url: 'https://x.com/RunOnFlux', description: 'Follow official updates' },
        { name: 'Flux X Community', url: 'https://x.com/i/communities/1783579310768411056', description: 'Discussion and support' },
      ]
    }
  ]

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 grid-overlay opacity-20" />

      {/* Section dividers */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      {/* Background glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            <span className="electric-text">Helpful Resources</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
            Everything you need to get started with{' '}
            <span className="text-emerald-400" style={{ textShadow: '0 0 10px rgba(16, 185, 129, 0.5)' }}>
              Flux
            </span>
          </p>

          {/* Decorative line */}
          <div className="mt-6 flex justify-center">
            <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-[circuit-flow_3s_linear_infinite]" />
          </div>
        </div>

        {/* Resources Grid */}
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {resources.map((resource, index) => (
            <ResourceCard key={index} {...resource} />
          ))}
        </div>
      </div>
    </section>
  )
}
