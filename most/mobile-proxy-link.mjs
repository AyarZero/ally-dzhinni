export function sharedMobileProxy() { return async () => { throw new Error('Mobile proxy disabled in client build') } }
