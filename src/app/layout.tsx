import type { Metadata, Viewport } from 'next'
import './globals.css'
<<<<<<< HEAD
import packageJson from '../../package.json'
=======
import { APP_VERSION } from '@/lib/version'
>>>>>>> 5f7e536 (MGT-085: footer version badge from package.json)

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F1A2E',
}

export const metadata: Metadata = {
  title: {
    default: 'MyGridTime',
    template: '%s — MyGridTime',
  },
  description: 'Race-day timetable platform for motorsport events. Never miss your race.',
  manifest: '/manifest.json',
}

const appVersion = packageJson.version

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
<<<<<<< HEAD
        <footer className="pointer-events-none fixed bottom-3 right-3 z-50">
          <div className="rounded-full border border-white/20 bg-[#0F1A2E]/90 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
            v{appVersion}
          </div>
        </footer>
=======
        <span
          aria-label={`App version ${APP_VERSION}`}
          className="fixed bottom-1.5 right-2 z-50 select-none pointer-events-none rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-500/70 bg-white/60 backdrop-blur-sm"
        >
          v{APP_VERSION}
        </span>
>>>>>>> 5f7e536 (MGT-085: footer version badge from package.json)
      </body>
    </html>
  )
}
