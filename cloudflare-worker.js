/**
 * Cloudflare Worker: Proxy CORS seguro para Planning Center API
 * 
 * ¿Cómo instalarlo en 1 minuto? (100% Gratis para siempre en Cloudflare):
 * 1. Ve a https://dash.cloudflare.com/ -> Workers & Pages -> Create Application -> Create Worker
 * 2. Borra el código por defecto y pega este script.
 * 3. Haz clic en "Deploy".
 * 4. Copia la URL generada (ej: https://mi-proxy-pco.tu-usuario.workers.dev).
 * 5. Pégala en el campo "URL del Proxy CORS" en la ventana de Sincronizar de la app.
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Requested-With',
    'Access-Control-Max-Age': '86400',
};

export default {
    async fetch(request, env, ctx) {
        // Manejar preflight OPTIONS del navegador
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);

        // La URL de destino puede venir como ?url=https://api.planningcenteronline.com/... 
        // o directamente por subruta /services/v2/...
        let targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            targetUrl = 'https://api.planningcenteronline.com' + url.pathname + url.search;
        }

        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.delete('host');
        forwardHeaders.set('User-Agent', 'GestionCamarasMedia-CloudflareWorker/1.0');

        try {
            const pcoResponse = await fetch(targetUrl, {
                method: request.method,
                headers: forwardHeaders,
                body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.blob()
            });

            const responseHeaders = new Headers(pcoResponse.headers);
            Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));

            return new Response(pcoResponse.body, {
                status: pcoResponse.status,
                statusText: pcoResponse.statusText,
                headers: responseHeaders
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 502,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
        }
    }
};
