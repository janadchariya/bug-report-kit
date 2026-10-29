import 'server-only';
export type ChatProvider = { readonly mode: 'live' | 'synthetic' };
/** Bug cards use personal webhooks. The legacy API provider stays dormant. */
export function getChatProvider(): ChatProvider { return { mode: 'synthetic' }; }
