import React, { useState } from 'react'
import { GithubGlyph, XGlyph, ChatGlyph } from './FluxGlyphs'

// Social Link Component
const SocialLink = ({ icon, href, title }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      className="relative w-11 h-11 rounded-xl overflow-hidden transition-all duration-500"
      title={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background */}
      <div
        className="absolute inset-0 transition-all duration-500"
        style={{
          background: isHovered
            ? 'linear-gradient(145deg, rgba(34, 211, 238, 0.22), rgba(15, 23, 42, 0.62))'
            : 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)'
        }}
      />

      {/* Border glow */}
      <div
        className="absolute inset-0 rounded-xl transition-all duration-500"
        style={{
          boxShadow: isHovered ? '0 0 18px rgba(34, 211, 238, 0.55), inset 0 0 16px rgba(34, 211, 238, 0.14)' : 'none',
          border: isHovered ? '1px solid rgba(34, 211, 238, 0.58)' : '1px solid rgba(255, 255, 255, 0.14)'
        }}
      />

      {/* Icon */}
      <div className="relative w-full h-full flex items-center justify-center">
        <span
          className="transition-all duration-300"
          style={{
            color: isHovered ? '#22d3ee' : 'white',
            filter: isHovered ? 'drop-shadow(0 0 8px #22d3ee)' : 'none',
            transform: isHovered ? 'scale(1.1)' : 'scale(1)'
          }}
        >
          {icon}
        </span>
      </div>
    </a>
  )
}

// Footer Link Component
const FooterLink = ({ href, children }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="transition-all duration-300 inline-flex items-center gap-1"
      style={{
        color: isHovered ? '#22d3ee' : '#94a3b8',
        textShadow: isHovered ? '0 0 10px rgba(34, 211, 238, 0.5)' : 'none'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </a>
  )
}

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative py-12 px-4 overflow-hidden">
      {/* Top border with animated gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.5) 25%, rgba(168, 85, 247, 0.5) 50%, rgba(236, 72, 153, 0.5) 75%, transparent 100%)'
        }}
      />

      {/* Animated energy line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] animate-[circuit-flow_4s_linear_infinite]"
        style={{
          background: 'linear-gradient(90deg, transparent, #22d3ee, #a855f7, #ec4899, transparent)',
          backgroundSize: '200% 100%'
        }}
      />

      {/* Background glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div
        className="max-w-7xl mx-auto relative z-10 rounded-[1.8rem] overflow-hidden p-6 sm:p-8"
        style={{
          background: 'linear-gradient(145deg, rgba(8, 13, 28, 0.86), rgba(10, 18, 35, 0.88), rgba(7, 12, 25, 0.9))',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <div
          className="absolute inset-0 opacity-35 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        {/* Main Footer Content */}
        <div className="grid md:grid-cols-4 gap-8 mb-8 relative z-10">
          {/* About */}
          <div className="md:col-span-2">
            <h3 className="text-xl font-bold mb-4 electric-text">
              Flux Community
            </h3>
            <p className="text-slate-400 mb-4">
              A decentralized Web3 cloud infrastructure comprised of user-operated,
              scalable and globally distributed computational nodes.
            </p>

            {/* Social Links */}
            <div className="flex gap-4">
              <SocialLink
                icon={<XGlyph className="w-5 h-5" />}
                href="https://x.com/RunOnFlux"
                title="Official Flux X"
              />
              <SocialLink
                icon={<ChatGlyph className="w-5 h-5" />}
                href="https://discord.com/invite/runonflux"
                title="Discord Server"
              />
              <SocialLink
                icon={<GithubGlyph className="w-5 h-5" />}
                href="https://github.com/RunOnFlux"
                title="GitHub"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <FooterLink href="https://runonflux.io">
                  Official Website
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://docs.runonflux.com">
                  Documentation
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://explorer.runonflux.io">
                  Block Explorer
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://academy.app.runonflux.io/?utm_source=community">
                  Flux Academy
                </FooterLink>
              </li>
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Developers</h4>
            <ul className="space-y-2">
              <li>
                <FooterLink href="https://github.com/RunOnFlux">
                  GitHub
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://docs.runonflux.io/fluxapi">
                  API Docs
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://docs.runonflux.com/fluxnodes/what-are-fluxnodes">
                  FluxNode Setup
                </FooterLink>
              </li>
              <li>
                <FooterLink href="https://cloud.runonflux.com/?utm_source=community">
                  Deploy Your App
                </FooterLink>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 relative z-10">
          {/* Separator line */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)'
            }}
          />

          <p className="text-slate-500 text-sm text-center font-mono">
            <span className="text-slate-600">//</span> {currentYear} · Powered by{' '}
            <span className="text-cyan-500">decentralized nodes</span> worldwide
          </p>

          {/* Decorative bottom element */}
          <div className="mt-6 flex justify-center">
            <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          </div>
        </div>
      </div>
    </footer>
  )
}
