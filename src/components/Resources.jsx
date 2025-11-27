import React from 'react'
import { BookOpen, FileText, Video, MessageCircle, Code, ExternalLink, Book, Newspaper } from 'lucide-react'

export default function Resources() {
  const resources = [
    {
      category: 'Documentation',
      icon: <BookOpen className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      links: [
        { name: 'Official Flux Docs', url: 'https://docs.runonflux.com/', description: 'Complete technical documentation' },
        { name: 'FluxNode Setup Guide', url: 'https://docs.runonflux.com/fluxnodes/what-are-fluxnodes', description: 'Step-by-step node installation' },
        { name: 'API Documentation', url: 'https://docs.runonflux.io/fluxapi', description: 'Flux API reference and endpoints' },
      ]
    },
    {
      category: 'Developer Resources',
      icon: <Code className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      links: [
        { name: 'RunOnFlux GitHub', url: 'https://github.com/RunOnFlux', description: 'Main organization repository' },
        { name: 'Flux (FluxOS)', url: 'https://github.com/runonflux/flux', description: 'Flux decentralized OS' },
        { name: 'Fluxd', url: 'https://github.com/runonflux/fluxd', description: 'Flux blockchain daemon' },
      ]
    },
    {
      category: 'Learning Materials',
      icon: <Video className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      links: [
        { name: 'YouTube Channel', url: 'https://www.youtube.com/@runonflux_official', description: 'Video tutorials and updates' },
        { name: 'Flux Academy', url: 'https://academy.app.runonflux.io/', description: 'Interactive learning platform' },
        { name: 'Blog & Articles', url: 'https://runonflux.com/blog/', description: 'Latest news and insights' },
      ]
    },
    {
      category: 'Community',
      icon: <MessageCircle className="w-6 h-6" />,
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
    <section className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Helpful Resources</span>
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto px-4">
            Everything you need to get started with Flux
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {resources.map((resource, index) => (
            <div key={index} className="glass rounded-2xl p-6 sm:p-8 hover:bg-white/10 transition-all">
              {/* Category Header */}
              <div className="flex items-center gap-3 sm:gap-4 mb-6">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br ${resource.color} p-2.5`}>
                  <div className="text-white">
                    {resource.icon}
                  </div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold">{resource.category}</h3>
              </div>

              {/* Links */}
              {resource.category === 'Community' ? (
                <div className="space-y-4">
                  {/* Discord and Telegram - Full Width */}
                  {resource.links.slice(0, 2).map((link, linkIndex) => (
                    <a
                      key={linkIndex}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-semibold mb-1 flex items-center gap-2">
                            {link.name}
                            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                          </div>
                          <div className="text-sm text-slate-400">{link.description}</div>
                        </div>
                      </div>
                    </a>
                  ))}
                  {/* X Links - Side by Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {resource.links.slice(2).map((link, linkIndex) => (
                      <a
                        key={linkIndex + 2}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold mb-1 flex items-center gap-2">
                              {link.name}
                              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            </div>
                            <div className="text-sm text-slate-400">{link.description}</div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {resource.links.map((link, linkIndex) => (
                    <a
                      key={linkIndex}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-semibold mb-1 flex items-center gap-2">
                            {link.name}
                            <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                          </div>
                          <div className="text-sm text-slate-400">{link.description}</div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
