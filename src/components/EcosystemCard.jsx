import React, { useState } from 'react'
import { OpenNewWindow, NavArrowRight } from 'iconoir-react'

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
      className="relative rounded-2xl cursor-pointer group"
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
        className="absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{
          background: `linear-gradient(135deg, ${colors.border}, transparent, ${colors.border})`,
          opacity: isHovered ? 0.8 : 0.3
        }}
      />

      {/* Inner card */}
      <div
        className="relative m-[2px] rounded-2xl p-6 sm:p-8 transition-all duration-300 overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-300"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.accent}, transparent)`,
            opacity: isHovered ? 1 : 0.4
          }}
        />

        {/* Icon */}
        <div className="relative mb-6">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center transform transition-all duration-300 relative ${isHovered ? 'scale-105' : ''}`}
          >
            <div className="text-white relative z-10 w-8 h-8">
              {icon}
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl sm:text-2xl font-bold mb-3 flex items-center justify-between">
          <span className={`transition-colors duration-300 ${isHovered ? 'text-white' : 'text-slate-100'}`}>
            {title}
          </span>
          <OpenNewWindow
            className={`w-5 h-5 transition-all duration-300 ${isHovered ? 'translate-x-1 -translate-y-1 text-white' : 'text-slate-400'}`}
            strokeWidth={2}
          />
        </h3>

        {/* Description */}
        <p className="text-slate-300 mb-6">
          {description}
        </p>

        {/* Features */}
        <div className="space-y-2">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-2 text-sm text-slate-400 transition-all duration-300"
              style={{
                transform: isHovered ? 'translateX(4px)' : 'translateX(0)'
              }}
            >
              <NavArrowRight
                className="w-4 h-4 transition-colors duration-300"
                style={{ color: isHovered ? colors.accent : '#60a5fa' }}
                strokeWidth={2}
              />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-300"
        style={{
          boxShadow: isHovered
            ? `0 0 30px ${colors.glow}, 0 10px 40px rgba(0,0,0,0.4)`
            : '0 4px 20px rgba(0,0,0,0.3)',
          transform: isHovered ? 'scale(1.01)' : 'scale(1)'
        }}
      />
    </div>
  )
}
