// server.js (en la raíz)
// Un puente que solo haga require('./.next/standalone/server.js') y fuerce process.env.NODE_ENV = 'production'.

process.env.NODE_ENV = 'production';
require('./.next/standalone/server.js');
