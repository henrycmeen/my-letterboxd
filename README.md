# My Letterboxd

A personal movie tracking application built with the [T3 Stack](https://create.t3.gg/), featuring a unique VHS-style interface and retro CRT effects. This project allows you to showcase your movie collection with a nostalgic twist.

![VHS Interface Screenshot](/docs/images/index.png)

## Features

- 📼 VHS-style movie cover display with interactive coverflow effect
- 📺 Retro CRT screen effects with scan lines and screen flicker
- 🕰️ Digital clock display with retro aesthetics
- 🎬 Integration with Letterboxd data for movie tracking
- 🎯 Display of highest-rated and recently watched movies

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- pnpm (Package manager)

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/my-letterboxd.git
cd my-letterboxd
```

2. Install dependencies
```bash
pnpm install
```

3. Set up environment variables
```bash
cp .env.example .env
```
Fill in the required environment variables in the `.env` file.

4. Start the development server
```bash
pnpm dev
```

## Project Structure

- `/src/components` - React components including VHS coverflow and retro effects
- `/src/data` - Data management and API integration
- `/public` - Static assets including movie covers and VHS case images

## Built With

- [Next.js](https://nextjs.org) - React framework
- [NextAuth.js](https://next-auth.js.org) - Authentication
- [Prisma](https://prisma.io) - Database ORM
- [Drizzle](https://orm.drizzle.team) - SQL toolkit
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [tRPC](https://trpc.io) - End-to-end typesafe APIs

## Development

This project uses the T3 Stack, providing a robust foundation for full-stack development. To learn more about the T3 Stack, check out:

- [T3 Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available)

## VHS Render API (WIP)

Backend scaffold for automatic "VHS look" rendering is now available.

- `GET /api/vhs/templates`
  Returns available template definitions and default template id.

- `POST /api/vhs/render`
  Renders a PNG or WEBP by combining a source image with template geometry and optional overlay layers.

Example payload:

```json
{
  "sourcePath": "/VHS/Front Side Cover Burning.png",
  "templateId": "retro-cover-default",
  "fit": "cover",
  "format": "png"
}
```

## Deployment

Follow the deployment guides for:
- [Vercel](https://create.t3.gg/en/deployment/vercel)
- [Netlify](https://create.t3.gg/en/deployment/netlify)
- [Docker](https://create.t3.gg/en/deployment/docker)

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.
