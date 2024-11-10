const { Pool } = require('pg');

const pool = new Pool({
  user: 'elloukelie',
  host: 'localhost',
  database: 'bland_inbound_lead',
  password: '1152',
  port: 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
}; 