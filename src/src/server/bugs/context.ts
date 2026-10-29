import 'server-only';
import type { CreateBugInput } from '@/src/lib/bugs/input';
import { sanitizeBugLocation } from '@/src/lib/bugs/context';
import { parseUserAgent } from '@/src/lib/bugs/user-agent';

export function createBugContext(input: Pick<CreateBugInput, 'pathname' | 'query' | 'viewportWidth' | 'viewportHeight'>, rawUserAgent: string, buildSha: string | undefined) {
  const location = sanitizeBugLocation(input);
  const userAgent = rawUserAgent.slice(0, 2048);
  return {
    pagePath: location.path, pageQuery: location.query ?? '', viewportWidth: input.viewportWidth, viewportHeight: input.viewportHeight,
    userAgent, ...parseUserAgent(userAgent), appBuildSha: buildSha && /^[a-f0-9]{7,64}$/i.test(buildSha) ? buildSha : null,
  };
}
export type BugCreateContext = ReturnType<typeof createBugContext>;
