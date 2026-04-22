import type { Metadata, Viewport } from 'next'
import './globals.css'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
