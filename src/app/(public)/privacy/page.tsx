import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-8 inline-block">
          &larr; Back to MyGridTime
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Overview</h2>
            <p className="text-gray-600 leading-relaxed">
              MyGridTime is a timetable management platform for motorsport events.
              This policy explains what information we collect, how we use it, and your rights regarding that information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Information We Collect</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>
                <strong>Account information:</strong> When you sign in, we collect your email address
                through our authentication provider (Supabase Auth). We support magic link and OAuth sign-in methods.
              </li>
              <li>
                <strong>Organisation and event data:</strong> Information you provide when creating organisations,
                events, and timetables, including event names, venues, dates, and timetable entries.
              </li>
              <li>
                <strong>Notification email addresses:</strong> Email addresses you provide as notification
                recipients for event updates. These are stored as part of event configuration.
              </li>
              <li>
                <strong>Notification preferences:</strong> We store unsubscribe preferences (opt-out status)
                for notification recipients.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">How We Use Your Information</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>To authenticate your identity and manage your account session.</li>
              <li>To provide the timetable management and publishing features you use.</li>
              <li>To send transactional email notifications about event and timetable changes, when explicitly opted in by an event administrator.</li>
              <li>To maintain audit logs of event management actions for accountability.</li>
              <li>To monitor application errors and performance for service reliability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Email Notifications</h2>
            <p className="text-gray-600 leading-relaxed">
              Event notifications are sent only when an event administrator explicitly opts in during
              publish or save actions. All notification emails include an unsubscribe link.
              You can unsubscribe from notifications at any time without needing to sign in.
              Unsubscribed email addresses will not receive further event notifications.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Data Storage and Security</h2>
            <p className="text-gray-600 leading-relaxed">
              Your data is stored in a PostgreSQL database hosted by Supabase, with row-level security
              policies enforcing access control. We use HTTPS for all data transmission.
              Application errors are tracked via Sentry for service reliability.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Third-Party Services</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li><strong>Supabase:</strong> Database hosting and authentication.</li>
              <li><strong>Resend:</strong> Transactional email delivery.</li>
              <li><strong>Sentry:</strong> Error monitoring and application performance.</li>
              <li><strong>Netlify:</strong> Application hosting and deployment.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Rights</h2>
            <p className="text-gray-600 leading-relaxed">
              You may request access to, correction of, or deletion of your personal data at any time.
              Notification recipients can unsubscribe from event emails using the link provided in each email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              For privacy-related questions or data requests, please contact the MyGridTime team
              through the application or at the email address provided in your account communications.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-200">
          <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-700">
            Terms of Service &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
