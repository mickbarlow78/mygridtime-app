import type { Metadata, Viewport } from 'next'
import './globals.css'
import packageJson from '../../package.json'

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
        <footer className="pointer-events-none fixed bottom-3 right-3 z-50">
          <div className="rounded-full border border-white/20 bg-[#0F1A2E]/90 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-sm">
            v{appVersion}
          </div>
        </footer>
      </body>
    </html>
  )
}
