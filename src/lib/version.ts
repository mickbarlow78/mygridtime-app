import pkg from '../../package.json'

export const APP_VERSION: string = pkg.version
export const APP_COMMIT_SHA: string = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ?? ''
