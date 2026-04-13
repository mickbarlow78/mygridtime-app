export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvOnStartup } = await import('./lib/env')
    validateEnvOnStartup()

    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}
