import React, { useState } from 'react'
import { ExternalLinkGlyph, ArrowRightGlyph } from './FluxGlyphs'

export default function EcosystemCard({ title, description, icon, link, color, features, delay = 0 }) {
  const [isHovered, setIsHovered] = useState(false)

  // Color mapping for different card types
  const colorMap = {
    'from-blue-500 to-cyan-500': {
      border: 'rgba(34, 211, 238, 0.5)',
      glow: 'rgba(34, 211, 238, 0.3)',
      accent: '#22d3ee'
    },
    'from-indigo-500 to-purple-500': {
      border: 'rgba(168, 85, 247, 0.5)',
      glow: 'rgba(168, 85, 247, 0.3)',
      accent: '#a855f7'
    },
    'from-purple-500 to-pink-500': {
      border: 'rgba(236, 72, 153, 0.5)',
      glow: 'rgba(236, 72, 153, 0.3)',
      accent: '#ec4899'
    },
    'from-orange-500 to-red-500': {
      border: 'rgba(249, 115, 22, 0.5)',
      glow: 'rgba(249, 115, 22, 0.3)',
      accent: '#f97316'
    }
  }

  const colors = colorMap[color] || colorMap['from-blue-500 to-cyan-500']

  return (
    <div
      className="relative cursor-pointer group"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        const newWindow = window.open(link, '_blank', 'noopener,noreferrer')
        if (newWindow) newWindow.opener = null
      }}
    >
      {/* Border gradient */}
      <div
        className="absolute inset-0 rounded-[1.7rem] transition-all duration-500"
        style={{
          background: `linear-gradient(120deg, ${colors.border}, transparent 40%, ${colors.border})`,
          opacity: isHovered ? 1 : 0.45
        }}
      />

      {/* Inner card */}
      <div
        className="relative m-[1px] rounded-[1.65rem] p-6 sm:p-8 transition-all duration-500 overflow-hidden"
        style={{
          clipPath: 'polygon(0 12px, 12px 0, calc(100% - 30px) 0, 100% 30px, 100% 100%, 0 100%)',
          background: 'linear-gradient(145deg, rgba(9, 16, 31, 0.92) 0%, rgba(15, 23, 42, 0.88) 48%, rgba(6, 10, 23, 0.94) 100%)',
          backdropFilter: 'blur(24px)'
        }}
      >
        {/* Surface noise and grid detail */}
        <div
          className="absolute inset-0 pointer-events-none opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56, 189, 248, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.06) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />

        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            opacity: isHovered ? 1 : 0.5,
            backgroundSize: '200% 100%',
            animation: isHovered ? 'circuit-flow 1.8s linear infinite' : 'none'
          }}
        />

        {/* Corner accent */}
        <div
          className="absolute top-0 right-0 h-14 w-14 pointer-events-none transition-opacity duration-300"
          style={{
            background: `linear-gradient(135deg, ${colors.accent}40, transparent 65%)`,
            opacity: isHovered ? 1 : 0.55
          }}
        />

        {/* Icon */}
        <div className="relative mb-6 z-10">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center transform transition-all duration-500 relative ${isHovered ? 'scale-110 -rotate-3' : ''}`}
            style={{
              boxShadow: isHovered ? `0 0 28px ${colors.glow}` : '0 8px 20px rgba(2,6,23,0.5)'
            }}
          >
            <div className="text-white relative z-10 w-8 h-8">
              {icon}
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl sm:text-2xl font-bold mb-3 flex items-center justify-between relative z-10">
          <span className={`transition-colors duration-300 ${isHovered ? 'text-white' : 'text-slate-100'}`}>
            {title}
          </span>
          <ExternalLinkGlyph className={`w-5 h-5 transition-all duration-300 ${isHovered ? 'translate-x-1 -translate-y-1 text-white' : 'text-slate-400'}`} />
        </h3>

        {/* Description */}
        <p className="text-slate-300 mb-6 relative z-10 leading-relaxed">
          {description}
        </p>

        {/* Features */}
        <div className="grid gap-2 relative z-10">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-2 text-sm text-slate-400 transition-all duration-500 rounded-lg px-2 py-1"
              style={{
                transform: isHovered ? 'translateX(6px)' : 'translateX(0)',
                background: isHovered ? 'rgba(15, 23, 42, 0.45)' : 'transparent'
              }}
            >
              <ArrowRightGlyph
                className="w-4 h-4 transition-colors duration-300"
                style={{ color: isHovered ? colors.accent : '#60a5fa' }}
              />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-[1.7rem] pointer-events-none transition-all duration-500"
        style={{
          boxShadow: isHovered
            ? `0 0 36px ${colors.glow}, 0 18px 60px rgba(2,6,23,0.7)`
            : '0 8px 24px rgba(2,6,23,0.45)',
          transform: isHovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)'
        }}
      />
    </div>
  )
}
