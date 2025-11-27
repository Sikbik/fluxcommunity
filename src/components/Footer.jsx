import React from 'react'
import { Github, X, MessageCircle, Heart } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="py-12 px-4 border-t border-white/10">
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Content */}
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* About */}
          <div className="md:col-span-2">
            <h3 className="text-xl font-bold mb-4 gradient-text">Flux Community</h3>
            <p className="text-slate-400 mb-4">
              A decentralized Web3 cloud infrastructure comprised of user-operated,
              scalable and globally distributed computational nodes.
            </p>
            <div className="flex gap-4">
              <a
                href="https://x.com/RunOnFlux"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg glass hover:bg-white/10 transition-all flex items-center justify-center"
                title="Official Flux X"
              >
                <X className="w-5 h-5" />
              </a>
              <a
                href="https://discord.com/invite/runonflux"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg glass hover:bg-white/10 transition-all flex items-center justify-center"
                title="Discord Server"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
              <a
                href="https://github.com/RunOnFlux"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg glass hover:bg-white/10 transition-all flex items-center justify-center"
                title="GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <a href="https://runonflux.io" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  Official Website
                </a>
              </li>
              <li>
                <a href="https://docs.runonflux.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://explorer.runonflux.io" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  Block Explorer
                </a>
              </li>
              <li>
                <a href="https://academy.app.runonflux.io/?utm_source=community" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  Flux Academy
                </a>
              </li>
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h4 className="font-semibold mb-4">Developers</h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <a href="https://github.com/RunOnFlux" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://docs.runonflux.io/fluxapi" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  API Docs
                </a>
              </li>
              <li>
                <a href="https://docs.runonflux.com/fluxnodes/what-are-fluxnodes" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  FluxNode Setup
                </a>
              </li>
              <li>
                <a href="https://cloud.runonflux.com/?utm_source=community" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                  Deploy Your App
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 text-center">
          <p className="text-slate-400 text-sm">
            {currentYear} Flux Community Portal. Built with{' '}
            <Heart className="w-4 h-4 inline text-red-400" /> by the community.
          </p>
        </div>
      </div>
    </footer>
  )
}
