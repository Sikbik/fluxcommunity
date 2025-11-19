import React, { useState } from 'react'
import { ExternalLink, ChevronRight } from 'lucide-react'

export default function EcosystemCard({ title, description, icon, link, color, features, delay = 0 }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="glass rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-all duration-300 group cursor-pointer transform hover:scale-105 relative"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        const newWindow = window.open(link, '_blank', 'noopener,noreferrer')
        if (newWindow) newWindow.opener = null
      }}
    >
      {/* Icon */}
      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br ${color} p-3 mb-6 transform transition-transform group-hover:rotate-6 group-hover:scale-110`}>
        <div className="text-white">
          {icon}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl sm:text-2xl font-bold mb-3 flex items-center justify-between">
        {title}
        <ExternalLink className={`w-5 h-5 text-slate-400 transition-all ${isHovered ? 'translate-x-1 -translate-y-1' : ''}`} />
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
            className="flex items-center gap-2 text-sm text-slate-400"
          >
            <ChevronRight className="w-4 h-4 text-blue-400" />
            {feature}
          </div>
        ))}
      </div>

      {/* Hover Effect Border */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${color} opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none`} />
    </div>
  )
}
