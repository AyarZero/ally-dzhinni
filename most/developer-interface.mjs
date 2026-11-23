export function developerInterface(html) { return html.replace(/<html\b/, '<html data-interface="user"') }
export async function ensureDeveloperPreview() { throw Object.assign(new Error("Preview unavailable"), {status:404}) }
export async function resetDeveloperPreview() { throw Object.assign(new Error("Preview unavailable"), {status:404}) }
