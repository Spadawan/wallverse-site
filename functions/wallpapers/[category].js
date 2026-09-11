import { catalogPage } from '../../lib/seo.js';
export const onRequestGet = context => catalogPage(context,String(context.params.category || ''));
export async function onRequestHead(context) { const r = await onRequestGet(context); return new Response(null,r); }
