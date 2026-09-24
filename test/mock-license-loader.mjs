/** Replaces license verification only inside deterministic runtime tests. */
export async function load(url, context, nextLoad) {
  if (url.endsWith('/picoflow/utils/verify-license.js')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export function verifyLicense() { return {}; }',
    };
  }

  return nextLoad(url, context);
}
