export type StampBindings = {
  SCRY_ENV?: 'staging' | 'production' | 'dev';
  SCRY_SERVICE?: string;
  SCRY_COMMIT?: string;
  SCRY_BRANCH?: string;
  SCRY_BUILD_TIME?: string;
  SCRY_DEPLOY_ID?: string;
  SCRY_ACTOR?: string;
};

export function deployStamp(env: StampBindings = {}) {
  return {
    ok: true as const,
    service: env.SCRY_SERVICE ?? (env.SCRY_ENV === 'staging'
      ? 'storybook-deployment-service-preview'
      : 'storybook-deployment-service'),
    env: env.SCRY_ENV ?? 'dev',
    commit: env.SCRY_COMMIT ?? 'dev',
    branch: env.SCRY_BRANCH ?? null,
    builtAt: env.SCRY_BUILD_TIME ?? null,
    deployId: env.SCRY_DEPLOY_ID ?? null,
    actor: env.SCRY_ACTOR ?? null,
  };
}
