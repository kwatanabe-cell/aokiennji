export const DIRECT_JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const GATEWAY_JEV_ENDPOINT = 'https://ai-gateway.vercel.sh/typesafe/v1/systemone';

export function jevEndpoint() {
  const base = (process.env.TYPESAFE_API_BASE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '');
  if (base === 'https://api.typesafe.ai') return DIRECT_JEV_ENDPOINT;
  if (base === 'https://ai-gateway.vercel.sh/typesafe') return GATEWAY_JEV_ENDPOINT;
  throw Error('Jevの接続先設定が不正です');
}
