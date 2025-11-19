# Flux Community Portal

A modern, responsive web portal showcasing the Flux decentralized cloud infrastructure ecosystem. This community-driven platform features applications, resources, and tools built on Flux technology.

## Overview

The Flux Community Portal serves as a central hub for discovering applications, tools, and resources within the Flux ecosystem. Built with performance and user experience in mind, it provides real-time network statistics and comprehensive information about the decentralized infrastructure platform.

## Features

- **Real-time Network Statistics**: Live data from Flux network APIs displaying block height and node count
- **Featured Applications**: Curated showcase of community-built applications
- **Ecosystem Overview**: Comprehensive information about Flux infrastructure components
- **Resource Directory**: Organized links to documentation, tools, and community channels
- **Mobile Responsive**: Fully optimized for desktop, tablet, and mobile devices
- **Security Hardened**: Implements CSP, security headers, and best practices
- **Performance Optimized**: Fast load times with optimized assets and caching

## Technology Stack

- **Frontend Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Web Server**: Nginx (Alpine Linux)
- **Containerization**: Docker
- **Base Image**: Alpine Linux 3.19

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Sikbik/fluxcommunity.git
cd fluxcommunity
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

Create an optimized production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Docker Deployment

### Building the Docker Image

```bash
docker build -t littlestache/community:latest .
```

### Running the Container

```bash
docker run -d -p 42069:42069 littlestache/community:latest
```

The application will be accessible at `http://localhost:42069`

### Deployment Specifications

Recommended minimum specifications for deployment:
- CPU: 0.1 cores
- RAM: 100 MB
- Storage: 1 GB SSD
- Port: 42069

Actual resource usage:
- RAM: ~17 MB
- CPU: <1% at idle
- Image Size: 14.2 MB

## Project Structure

```
fluxcommunity/
├── public/              # Static assets
│   └── favicon.svg     # Flux logo favicon
├── src/
│   ├── components/     # React components
│   │   ├── Hero.jsx
│   │   ├── FeaturedApps.jsx
│   │   ├── EcosystemCard.jsx
│   │   ├── Resources.jsx
│   │   └── Footer.jsx
│   ├── App.jsx         # Main application component
│   ├── index.css       # Global styles and Tailwind directives
│   └── main.jsx        # Application entry point
├── nginx.conf          # Nginx server configuration
├── nginx-main.conf     # Nginx main configuration
├── Dockerfile          # Multi-stage Docker build
├── .dockerignore       # Docker build exclusions
└── package.json        # Project dependencies and scripts
```

## Security

This project implements comprehensive security measures:

- Content Security Policy (CSP)
- X-Frame-Options, X-Content-Type-Options, X-XSS-Protection headers
- Referrer Policy and Permissions Policy
- All external links use `rel="noopener noreferrer"`
- No known vulnerabilities in dependencies
- Non-root container execution
- Minimal attack surface with Alpine Linux base

Security audit score: A+

## API Endpoints

The application fetches data from official Flux API endpoints:

- Block Count: `https://api.runonflux.io/daemon/getblockcount`
- Node Count: `https://api.runonflux.io/daemon/getzelnodecount`

## Contributing

Contributions are welcome! To submit your application to be featured on the portal:

1. Join the Flux Discord: https://discord.com/invite/runonflux
2. Ping @bigstache with your application details
3. Include: application name, description, category, and live URL

For code contributions, please ensure:
- Code follows existing patterns and style
- All external links include UTM tracking: `?utm_source=community`
- Mobile responsiveness is maintained
- Security best practices are followed

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality

### Adding Featured Applications

Edit `src/components/FeaturedApps.jsx` and add your application to the `featuredApps` array:

```javascript
{
  name: 'Your App Name',
  description: 'Brief description of your application',
  category: 'Category', // e.g., 'Infrastructure', 'Tools', 'Hosting'
  icon: <IconComponent className="w-6 h-6" />,
  color: 'from-color-500 to-color-500',
  status: 'Live', // or 'Beta', 'Coming Soon'
  link: 'https://yourapp.com/?utm_source=community'
}
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- First Contentful Paint: <1s
- Time to Interactive: <2s
- Lighthouse Score: 95+
- Optimized asset delivery with gzip compression
- Static asset caching (1 year)

## License

MIT License - see [LICENSE](LICENSE) file for details

Copyright (c) 2025 Sikbik

## Links

- Flux Official Website: https://runonflux.io
- Flux Documentation: https://docs.runonflux.io
- Flux GitHub: https://github.com/RunOnFlux
- Community Discord: https://discord.com/invite/runonflux

## Acknowledgments

Built for the Flux community. Special thanks to all contributors and the Flux development team for providing the decentralized infrastructure that powers this ecosystem.
