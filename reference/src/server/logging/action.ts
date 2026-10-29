import 'server-only';
import { withAction as guardedAction } from '@/src/server/auth/guard';
export function withAction<TInput, TOutput>(config: Parameters<typeof guardedAction<TInput, TOutput>>[0] & { readonly actionName: string }) { return guardedAction(config); }
