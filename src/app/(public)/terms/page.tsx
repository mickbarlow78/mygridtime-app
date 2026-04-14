import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-8 inline-block">
          &larr; Back to MyGridTime
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-8">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing or using MyGridTime, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Description of Service</h2>
            <p className="text-gray-600 leading-relaxed">
              MyGridTime is a timetable management platform for motorsport events. The service allows
              organisations to create, edit, publish, and share event timetables. Consumers can view
              published timetables and receive optional email notifications about changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Accounts</h2>
            <ul className="list-disc pl-5 text-gray-600 space-y-2">
              <li>You must provide a valid email address to create an account.</li>
              <li>You are responsible for maintaining the security of your account.</li>
              <li>Organisation administrators are responsible for managing member access and permissions within their organisations.</li>
              <li>You must not use the service for any unlawful purpose.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">User Content</h2>
            <p className="text-gray-600 leading-relaxed">
              You retain ownership of the content you create on MyGridTime, including event details,
              timetable entries, and organisation information. By publishing a timetable, you make it
              publicly accessible via its unique URL.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Notifications</h2>
            <p className="text-gray-600 leading-relaxed">
              Event administrators may send email notifications to addresses they configure for their events.
              Notifications are only sent when explicitly opted in by the administrator.
              All notification recipients can unsubscribe at any time using the link provided in each email.
              By providing an email address as a notification recipient, the event administrator confirms they
              have appropriate permission to contact that address.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Acceptable Use</h2>
            <p className="text-gray-600 leading-relaxed">
              You agree not to misuse the service, including but not limited to: sending unsolicited
              notifications to recipients without their consent, attempting to access other users&apos;
              data without authorisation, or interfering with the operation of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Availability</h2>
            <p className="text-gray-600 leading-relaxed">
              MyGridTime is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We do
              not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue
              any part of the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              To the maximum extent permitted by law, MyGridTime and its operators shall not be liable
              for any indirect, incidental, special, or consequential damages arising from your use of
              the service, including but not limited to missed race times, incorrect timetable information,
              or failed notifications.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these terms from time to time. Continued use of the service after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              For questions about these terms, please contact the MyGridTime team through the
              application or at the email address provided in your account communications.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-gray-200">
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700">
            Privacy Policy &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
