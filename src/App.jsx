import React, { useState, useEffect, useMemo } from 'react'
import {
  Cube,
  Book,
  Flash,
  OpenNewWindow,
  Github,
  X,
  ChatBubble,
  Cloud,
  Wallet,
  Group
} from 'iconoir-react'
import Hero from './components/Hero'
import EcosystemCard from './components/EcosystemCard'
import FeaturedApps from './components/FeaturedApps'
import Resources from './components/Resources'
import Footer from './components/Footer'

// Floating Energy Orb Component
const EnergyOrb = ({ size, color, position, delay, duration }) => {
  const colorMap = {
    blue: { bg: 'bg-blue-500', shadow: '0 0 60px rgba(59, 130, 246, 0.4), 0 0 100px rgba(59, 130, 246, 0.2)' },
    purple: { bg: 'bg-purple-500', shadow: '0 0 60px rgba(168, 85, 247, 0.4), 0 0 100px rgba(168, 85, 247, 0.2)' },
    pink: { bg: 'bg-pink-500', shadow: '0 0 60px rgba(236, 72, 153, 0.4), 0 0 100px rgba(236, 72, 153, 0.2)' },
    cyan: { bg: 'bg-cyan-500', shadow: '0 0 60px rgba(34, 211, 238, 0.4), 0 0 100px rgba(34, 211, 238, 0.2)' }
  }

  const colors = colorMap[color] || colorMap.blue

  return (
    <div
      className={`absolute rounded-full ${colors.bg} opacity-20 blur-3xl animate-float pointer-events-none`}
      style={{
        width: size,
        height: size,
        ...position,
        animationDelay: delay,
        animationDuration: duration,
        boxShadow: colors.shadow
      }}
    />
  )
}

// Electric Particle System
const ParticleField = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 2,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 4 + 4}s`,
      color: ['cyan', 'blue', 'purple', 'pink'][Math.floor(Math.random() * 4)]
    }))
  }, [])

  const colorClasses = {
    cyan: 'bg-cyan-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400'
  }

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute rounded-full ${colorClasses[p.color]} animate-float`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            boxShadow: `0 0 ${p.size * 3}px currentColor`,
            opacity: 0.5
          }}
        />
      ))}
    </div>
  )
}

// Wallet Card Component with Electric Effects
const WalletCard = ({ name, description, icon, link, color, tagline }) => {
  const [isHovered, setIsHovered] = useState(false)

  const colorMap = {
    'from-blue-500 to-cyan-500': { accent: '#22d3ee', glow: 'rgba(34, 211, 238, 0.3)' },
    'from-purple-500 to-pink-500': { accent: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)' }
  }

  const colors = colorMap[color] || colorMap['from-blue-500 to-cyan-500']

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="relative rounded-2xl cursor-pointer group block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated border */}
      <div
        className="absolute inset-0 rounded-2xl transition-all duration-300"
        style={{
          background: `linear-gradient(135deg, ${colors.glow}, transparent, ${colors.glow})`,
          opacity: isHovered ? 0.8 : 0.2
        }}
      />

      {/* Card content */}
      <div
        className="relative m-[2px] rounded-2xl p-6 sm:p-8 transition-all duration-300 overflow-hidden"
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
            opacity: isHovered ? 1 : 0.3
          }}
        />

        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6 relative">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center transform transition-all duration-300 relative ${isHovered ? 'scale-105' : ''}`}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9">
              {icon}
            </div>
          </div>
          <div>
            <h3 className={`text-xl sm:text-2xl font-bold transition-colors duration-300 ${isHovered ? 'text-white' : 'text-slate-100'}`}>
              {name}
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm">{tagline}</p>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm sm:text-base text-slate-300 mb-4">
          {description}
        </p>

        {/* CTA */}
        <div
          className="flex items-center gap-2 font-semibold text-sm sm:text-base transition-all duration-300"
          style={{
            color: isHovered ? colors.accent : '#60a5fa'
          }}
        >
          <span>Learn More</span>
          <OpenNewWindow className={`w-4 h-4 transition-transform duration-300 ${isHovered ? 'translate-x-1 -translate-y-1' : ''}`} strokeWidth={2} />
        </div>
      </div>

      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none transition-all duration-300"
        style={{
          boxShadow: isHovered
            ? `0 0 30px ${colors.glow}, 0 10px 40px rgba(0,0,0,0.4)`
            : '0 4px 20px rgba(0,0,0,0.2)',
          transform: isHovered ? 'scale(1.01)' : 'scale(1)'
        }}
      />
    </a>
  )
}

function App() {
  const ecosystemProjects = [
    {
      title: 'Cloud',
      description: 'Deploy and manage decentralized applications on Flux network with our intuitive deployment portal.',
      icon: <Cloud className="w-8 h-8" strokeWidth={1.5} />,
      link: 'https://cloud.runonflux.com/?utm_source=community',
      color: 'from-blue-500 to-cyan-500',
      features: ['App Deployment', 'Container Management', 'Scaling Tools', 'Resource Monitoring']
    },
    {
      title: 'Explorer',
      description: 'Real-time blockchain explorer with advanced analytics, FluxNode tracking, and rich list features.',
      icon: <Cube className="w-8 h-8" strokeWidth={1.5} />,
      link: 'https://explorer.runonflux.io/?utm_source=community',
      color: 'from-indigo-500 to-purple-500',
      features: ['Block Explorer', 'Transaction Tracking', 'Address Analytics', 'Rich List']
    },
    {
      title: 'Edge AI',
      description: 'High-performance AI inference platform powered by Flux decentralized GPU infrastructure.',
      icon: <Flash className="w-8 h-8" strokeWidth={1.5} />,
      link: 'https://console.fluxedge.ai/?utm_source=community',
      color: 'from-purple-500 to-pink-500',
      features: ['GPU Computing', 'AI Inference', 'Model Deployment', 'Decentralized Processing']
    },
    {
      title: 'Academy',
      description: 'Learn how to build and deploy applications on Flux through hands-on tutorials and interactive guides.',
      icon: <Book className="w-8 h-8" strokeWidth={1.5} />,
      link: 'https://academy.app.runonflux.io/?utm_source=community',
      color: 'from-orange-500 to-red-500',
      features: ['Tutorials', 'Documentation', 'Deployment Playground', 'Interactive Learning']
    }
  ]

  return (
    <div className="min-h-screen gradient-bg noise-overlay">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Energy Orbs */}
        <EnergyOrb
          size={500}
          color="blue"
          position={{ top: '10%', left: '10%' }}
          delay="0s"
          duration="8s"
        />
        <EnergyOrb
          size={400}
          color="purple"
          position={{ bottom: '20%', right: '15%' }}
          delay="2s"
          duration="10s"
        />
        <EnergyOrb
          size={350}
          color="pink"
          position={{ top: '50%', right: '25%' }}
          delay="4s"
          duration="7s"
        />
        <EnergyOrb
          size={300}
          color="cyan"
          position={{ bottom: '30%', left: '20%' }}
          delay="1s"
          duration="9s"
        />

        {/* Grid overlay */}
        <div className="absolute inset-0 grid-overlay opacity-20" />

        {/* Particle field */}
        <ParticleField />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Hero />

        {/* Ecosystem Section */}
        <section className="py-20 px-4 relative">
          {/* Section divider line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
                <span className="electric-text">Explore the Ecosystem</span>
              </h2>
              <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
                Discover powerful tools and applications built on{' '}
                <span className="text-cyan-400">Flux blockchain</span>
              </p>

              {/* Decorative line */}
              <div className="mt-6 flex justify-center">
                <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
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
        <section className="py-20 px-4 relative">
          {/* Section dividers */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

          {/* Background glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
          </div>

          <div className="max-w-7xl mx-auto relative">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
                <span className="electric-text">Flux Wallets</span>
              </h2>
              <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
                Secure and manage your Flux assets with{' '}
                <span className="text-purple-400">official wallet solutions</span>
              </p>

              {/* Decorative line */}
              <div className="mt-6 flex justify-center">
                <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
              <WalletCard
                name="Zelcore"
                tagline="Multi-Asset Wallet"
                description="Feature-rich multi-cryptocurrency wallet with built-in exchange, staking, and comprehensive asset management."
                icon={<Wallet className="w-full h-full text-white relative z-10" strokeWidth={1.5} />}
                link="https://zelcore.io/?utm_source=community"
                color="from-blue-500 to-cyan-500"
              />
              <WalletCard
                name="SSP Wallet"
                tagline="Enterprise Multisig Security"
                description="Enterprise-grade wallet with multisignature security, self-sovereign protocol, and advanced privacy features for institutional and individual users."
                icon={<Wallet className="w-full h-full text-white relative z-10" strokeWidth={1.5} />}
                link="https://sspwallet.io/?utm_source=community"
                color="from-purple-500 to-pink-500"
              />
            </div>
          </div>
        </section>

        {/* Featured Community Apps */}
        <FeaturedApps />

        {/* Resources */}
        <Resources />

        {/* CTA Section */}
        <section className="py-20 px-4 relative">
          {/* Section divider */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-pink-500/50 to-transparent" />

          <div className="max-w-4xl mx-auto text-center">
            <CTASection />
          </div>
        </section>

        <Footer />
      </div>
    </div>
  )
}

// CTA Section Component
const CTASection = () => {
  const [isHovered, setIsHovered] = useState(false)

  const socialLinks = [
    { name: 'Discord', icon: <ChatBubble className="w-5 h-5" strokeWidth={1.5} />, url: 'https://discord.com/invite/runonflux' },
    { name: 'Official X', icon: <X className="w-5 h-5" strokeWidth={2} />, url: 'https://x.com/RunOnFlux' },
    { name: 'X Community', icon: <Group className="w-5 h-5" strokeWidth={1.5} />, url: 'https://x.com/i/communities/1783579310768411056' },
    { name: 'GitHub', icon: <Github className="w-5 h-5" strokeWidth={1.5} />, url: 'https://github.com/RunOnFlux' }
  ]

  return (
    <div
      className="relative rounded-3xl overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Animated border */}
      <div
        className="absolute inset-0 rounded-3xl transition-all duration-300"
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.5), transparent, rgba(168, 85, 247, 0.5), transparent, rgba(236, 72, 153, 0.5))',
          opacity: isHovered ? 0.8 : 0.4
        }}
      />

      {/* Content */}
      <div
        className="relative m-[2px] rounded-3xl p-8 sm:p-12"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Animated top line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent transition-opacity duration-300"
          style={{ opacity: isHovered ? 1 : 0.5 }}
        />

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
          <span className="electric-text">Join the Flux Community</span>
        </h2>
        <p className="text-lg sm:text-xl text-slate-300 mb-8">
          Be part of the <span className="text-cyan-400">decentralized cloud revolution</span>
        </p>

        {/* Social Links */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
          {socialLinks.map((link, index) => (
            <SocialButton key={index} {...link} />
          ))}
        </div>
      </div>

      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none transition-all duration-300"
        style={{
          boxShadow: isHovered
            ? '0 0 50px rgba(59, 130, 246, 0.3), 0 0 80px rgba(168, 85, 247, 0.2)'
            : '0 4px 30px rgba(0,0,0,0.3)'
        }}
      />
    </div>
  )
}

// Social Button Component
const SocialButton = ({ name, icon, url }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative rounded-xl overflow-hidden w-full sm:w-auto"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Border */}
      <div
        className="absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.3), transparent)',
          opacity: isHovered ? 1 : 0.2
        }}
      />

      {/* Content */}
      <div
        className="relative m-[1px] rounded-xl px-6 sm:px-8 py-3 sm:py-4 font-semibold inline-flex items-center justify-center gap-2 transition-all duration-300"
        style={{
          background: isHovered ? 'rgba(34, 211, 238, 0.1)' : 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <span
          className="transition-all duration-300"
          style={{
            color: isHovered ? '#22d3ee' : 'white'
          }}
        >
          {icon}
        </span>
        <span className={isHovered ? 'text-white' : 'text-slate-200'}>{name}</span>
        <OpenNewWindow className={`w-4 h-4 transition-all duration-300 ${isHovered ? 'text-cyan-400 translate-x-0.5 -translate-y-0.5' : 'text-slate-400'}`} strokeWidth={2} />
      </div>

      {/* Glow */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none transition-all duration-300"
        style={{
          boxShadow: isHovered ? '0 0 20px rgba(34, 211, 238, 0.3)' : 'none'
        }}
      />
    </a>
  )
}

export default App
