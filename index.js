const fastify = require('fastify')({ logger: { level: 'error' } });
const HOST = process.env.HOST || '0.0.0.0'
const PORT = process.env.PORT || 8080;

// Declare a route
fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
})
//Health
fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
})

// Run the server!
const start = async () => {
    try {
        await fastify.listen({ host: HOST, port: PORT });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}
start();
