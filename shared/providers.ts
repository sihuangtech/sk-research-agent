import type { ApiMode } from './contracts.js';

export type AuthMethod = 'oauth' | 'api_key' | 'none';
export type BillingMode = 'subscription' | 'coding-plan' | 'api' | 'local';
export interface ProviderPreset {
  id: string;
  name: string;
  group: 'international' | 'china' | 'local';
  authMethod: AuthMethod;
  billing: BillingMode;
  sdkProvider?: string;
  baseUrl: string;
  api: ApiMode;
  docsUrl: string;
  usageUrl?: string;
  interactiveOnly?: boolean;
  models?: string[];
}
export interface ModelChoice {
  id: string;
  name: string;
  api: ApiMode;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
}
export interface LoginState {
  id: string;
  providerId: string;
  status: 'waiting' | 'connected' | 'failed' | 'cancelled';
  expiresAt: number;
  browserReady: boolean;
  userCode?: string;
  prompt?: {
    id: string;
    type: string;
    message: string;
    options?: readonly { id: string; label: string }[];
  };
  errorCode?: string;
}
