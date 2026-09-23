const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Pool } = require('pg');

const fastify = Fastify({ logger: true });

// Environment / Database configuration detection
const P = process.env.DB_ENV_PREFIX
  || Object.keys(process.env)
      .filter((k) => k.endsWith('_DATABASE_NAME'))
      .map((k) => k.slice(0, -'_DATABASE_NAME'.length))
      .sort((a, b) => (a === 'POSTGRES_SERVER_DEMOS') - (b === 'POSTGRES_SERVER_DEMOS'))[0]
  || 'CATALOGO_DB';

const env = (k) => process.env[`${P}_${k}`];

let pool = null;
let bancoPronto = false;
let ultimoErroBanco = null;
let totalSegurosCache = 0;

const insurerName = process.env.INSURER_NAME || "Seguros segura";
const primaryColor = process.env.PRIMARY_COLOR || "#00A3E0";

const SEED_SEGUROS = [
  { imagem: "🚗", titulo: "Seguro Auto", categoria: "Automóvel", valor_mensal: 139.90, cobertura_destaque: `Colisão, furto, roubo, terceiros e guincho 24h com a rede credenciada ${insurerName}` },
  { imagem: "📱", titulo: "Seguro Celular", categoria: "Eletrônicos", valor_mensal: 34.90, cobertura_destaque: "Quebra acidental, furto qualificado, roubo e danos elétricos" },
  { imagem: "✈️", titulo: "Seguro Viagem", categoria: "Viagem", valor_mensal: 27.90, cobertura_destaque: "Assistência médica internacional, telemedicina e bagagem" },
  { imagem: "🏠", titulo: "Seguro Residencial", categoria: "Residencial", valor_mensal: 49.90, cobertura_destaque: "Incêndio, vendaval, danos elétricos e serviços emergenciais" },
  { imagem: "❤️", titulo: "Seguro de Vida", categoria: "Vida", valor_mensal: 42.00, cobertura_destaque: "Morte, invalidez e doenças graves" },
  { imagem: "🏎️", titulo: "Seguro Auto Premium", categoria: "Automóvel", valor_mensal: 349.00, cobertura_destaque: "Alto padrão e blindados, peças genuínas e carro reserva" },
  { imagem: "🚚", titulo: "Seguro Frotas Empresariais", categoria: "Corporativo", valor_mensal: 199.00, cobertura_destaque: "Frotas e vans com rastreamento e suporte 24h" },
  { imagem: "💼", titulo: "Seguro Vida Premium", categoria: "Vida", valor_mensal: 180.00, cobertura_destaque: "Capital estendido, consultoria sucessória e check-up anual" },
  { imagem: "🚲", titulo: "Seguro Bike", categoria: "Mobilidade", valor_mensal: 29.90, cobertura_destaque: "Bicicletas urbanas e elétricas: roubo e transporte" },
  { imagem: "💻", titulo: "Seguro Equipamentos Profissionais", categoria: "Eletrônicos", valor_mensal: 62.00, cobertura_destaque: "Notebooks, câmeras e tablets em trânsito" }
];

async function iniciarBanco() {
  const faltando = ['HOSTNAME', 'PORT', 'DATABASE_NAME', 'USERNAME', 'PASSWORD'].filter((k) => !env(k));
  if (faltando.length) {
    const err = `Variáveis de conexão ausentes: ${faltando.map((k) => `${P}_${k}`).join(', ')}`;
    console.error(err);
    ultimoErroBanco = err;
    setTimeout(iniciarBanco, 5000);
    return;
  }

  if (!pool) {
    pool = new Pool({
      host: env('HOSTNAME'),
      port: Number(env('PORT') || 5432),
      database: env('DATABASE_NAME'),
      user: env('USERNAME'),
      password: env('PASSWORD'),
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 5000
    });
    pool.on('error', (err) => console.error(`Erro no pool do banco: ${err.message}`));
  }

  try {
    const client = await pool.connect();
    try {
      // 1. Criar tabela se não existir
      await client.query(`
        CREATE TABLE IF NOT EXISTS catalogo_seguros (
          id SERIAL PRIMARY KEY,
          titulo VARCHAR(150) NOT NULL,
          descricao TEXT NOT NULL,
          imagem VARCHAR(16) NOT NULL,
          categoria VARCHAR(50) NOT NULL,
          valor_mensal NUMERIC(10,2) NOT NULL,
          cobertura_destaque VARCHAR(250) NOT NULL,
          criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      // 2. Verificar se precisa de seed
      const resCount = await client.query('SELECT count(*)::int AS count FROM catalogo_seguros;');
      const currentCount = resCount.rows[0].count;
      if (currentCount === 0) {
        console.log('Tabela vazia. Executando seed de 10 seguros...');
        for (const item of SEED_SEGUROS) {
          await client.query(`
            INSERT INTO catalogo_seguros (imagem, titulo, categoria, valor_mensal, cobertura_destaque, descricao)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            item.imagem,
            item.titulo,
            item.categoria,
            item.valor_mensal,
            item.cobertura_destaque,
            `Proteção completa com ${item.titulo} oferecido por ${insurerName}. ${item.cobertura_destaque}.`
          ]);
        }
        totalSegurosCache = 10;
      } else {
        totalSegurosCache = currentCount;
      }

      bancoPronto = true;
      ultimoErroBanco = null;
      console.log('Banco de dados inicializado e conectado com sucesso!');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`Erro ao conectar/inicializar banco: ${err.code} ${err.message}`);
    ultimoErroBanco = `${err.code || 'ERR'} ${err.message}`;
    bancoPronto = false;
    setTimeout(iniciarBanco, 5000);
  }
}

// Rotas Fastify
fastify.register(cors, { origin: true });

// Health Check não depende do banco (Regra 10c)
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

fastify.get('/api/status', async (request, reply) => {
  if (!bancoPronto || !pool) {
    return reply.status(503).send({
      status: 'offline',
      seguradora: insurerName,
      corPredominante: primaryColor,
      bancoConectado: false,
      erro: ultimoErroBanco,
      host: env('HOSTNAME') || null,
      banco: env('DATABASE_NAME') || null,
      usuario: env('USERNAME') || null
    });
  }

  try {
    const res = await pool.query('SELECT count(*)::int AS count FROM catalogo_seguros;');
    totalSegurosCache = res.rows[0].count;
    return {
      status: 'online',
      seguradora: insurerName,
      corPredominante: primaryColor,
      bancoConectado: true,
      totalSeguros: totalSegurosCache
    };
  } catch (err) {
    return reply.status(503).send({
      status: 'offline',
      seguradora: insurerName,
      corPredominante: primaryColor,
      bancoConectado: false,
      erro: `${err.code || 'ERR'} ${err.message}`
    });
  }
});

fastify.get('/api/seguros', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const { busca, categoria } = request.query;

  let query = 'SELECT * FROM catalogo_seguros WHERE 1=1';
  const params = [];

  if (busca && busca.trim()) {
    params.push(`%${busca.trim()}%`);
    query += ` AND (titulo ILIKE $${params.length} OR descricao ILIKE $${params.length})`;
  }
  if (categoria && categoria.trim()) {
    params.push(categoria.trim());
    query += ` AND categoria = $${params.length}`;
  }

  query += ' ORDER BY id ASC';
  const res = await pool.query(query, params);
  return res.rows;
});

fastify.get('/api/seguros/:id', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const { id } = request.params;
  const res = await pool.query('SELECT * FROM catalogo_seguros WHERE id = $1', [id]);
  if (res.rows.length === 0) {
    return reply.status(404).send({ error: 'Seguro não encontrado' });
  }
  return res.rows[0];
});

fastify.post('/api/seguros', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const { titulo, descricao, imagem, categoria, valor_mensal, cobertura_destaque } = request.body || {};
  if (!titulo || !descricao || !imagem || !categoria || valor_mensal == null || !cobertura_destaque) {
    return reply.status(400).send({ error: 'Campos obrigatórios ausentes' });
  }
  if (Buffer.byteLength(imagem, 'utf8') > 16) {
    return reply.status(400).send({ error: 'Imagem deve conter no máximo 16 bytes (1 emoji/símbolo)' });
  }

  const res = await pool.query(`
    INSERT INTO catalogo_seguros (titulo, descricao, imagem, categoria, valor_mensal, cobertura_destaque)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [titulo, descricao, imagem, categoria, Number(valor_mensal), cobertura_destaque]);

  return reply.status(201).send(res.rows[0]);
});

fastify.put('/api/seguros/:id', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const { id } = request.params;
  const { titulo, descricao, imagem, categoria, valor_mensal, cobertura_destaque } = request.body || {};
  if (!titulo || !descricao || !imagem || !categoria || valor_mensal == null || !cobertura_destaque) {
    return reply.status(400).send({ error: 'Campos obrigatórios ausentes' });
  }
  if (Buffer.byteLength(imagem, 'utf8') > 16) {
    return reply.status(400).send({ error: 'Imagem deve conter no máximo 16 bytes (1 emoji/símbolo)' });
  }

  const res = await pool.query(`
    UPDATE catalogo_seguros
    SET titulo = $1, descricao = $2, imagem = $3, categoria = $4, valor_mensal = $5, cobertura_destaque = $6, atualizado_em = now()
    WHERE id = $7
    RETURNING *;
  `, [titulo, descricao, imagem, categoria, Number(valor_mensal), cobertura_destaque, id]);

  if (res.rows.length === 0) {
    return reply.status(404).send({ error: 'Seguro não encontrado' });
  }
  return res.rows[0];
});

fastify.delete('/api/seguros/:id', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const { id } = request.params;
  const res = await pool.query('DELETE FROM catalogo_seguros WHERE id = $1 RETURNING id;', [id]);
  if (res.rows.length === 0) {
    return reply.status(404).send({ error: 'Seguro não encontrado' });
  }
  return reply.status(204).send();
});

fastify.get('/api/categorias', async (request, reply) => {
  if (!bancoPronto || !pool) return reply.status(503).send({ error: 'Banco de dados indisponível' });
  const res = await pool.query('SELECT DISTINCT categoria FROM catalogo_seguros ORDER BY categoria ASC;');
  return res.rows.map(r => r.categoria);
});

// Start HTTP server immediately, then trigger DB init in background
const port = process.env.PORT || 8080;
fastify.listen({ port: Number(port), host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Servidor rodando em ${address}`);
  iniciarBanco();
});
