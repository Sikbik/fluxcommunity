# Flux Community Portal

Community hub for discovering apps, tools, and resources in the Flux ecosystem. Pulls live network stats from Flux APIs.

## Tech Stack

- React 19 + Vite 7
- Tailwind CSS v4
- Iconoir icons
- Nginx on Alpine Linux

## Development

```bash
npm install
npm run dev
```

Runs at `http://localhost:42069`

## Production Build

```bash
npm run build
```

Output goes to `dist/`

## Docker

```bash
docker build -t littlestache/community:latest .
docker run -d -p 42069:42069 littlestache/community:latest
```

Runs at `http://localhost:42069`

Resource usage is minimal (~17MB RAM, <1% CPU idle). Image size is around 14MB.

## Project Structure

```
src/
├── components/
│   ├── Hero.jsx          # Landing section with logo and stats
│   ├── FeaturedApps.jsx  # App showcase grid
│   ├── EcosystemCard.jsx # Reusable ecosystem cards
│   ├── Resources.jsx     # Links to docs, GitHub, community
│   └── Footer.jsx
├── App.jsx
├── index.css
└── main.jsx
```

## Adding an App

Edit `src/components/FeaturedApps.jsx`:

```javascript
{
  name: 'Your App',
  description: 'What it does',
  category: 'Infrastructure',
  icon: <YourIcon className="w-6 h-6" />,
  color: 'from-blue-500 to-cyan-500',
  status: 'Live',
  link: 'https://yourapp.com/?utm_source=community'
}
```

Or ping @bigstache on Discord with your app details.

## API Endpoints Used

- `https://api.runonflux.io/daemon/getblockcount`
- `https://api.runonflux.io/daemon/getzelnodecount`

## Links

- https://runonflux.io
- https://docs.runonflux.com
- https://github.com/RunOnFlux
- https://discord.com/invite/runonflux

## License

MIT
