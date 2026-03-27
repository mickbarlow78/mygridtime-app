import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'MyGridTime',
    template: '%s — MyGridTime',
  },
  description: 'Race-day timetable platform for motorsport events. Never miss your race.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
