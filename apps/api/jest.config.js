/** Pruebas de la API: de punta a punta contra Supabase local (npm run setup antes) y unitarias sin red (test/*.spec.ts). */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*[.-]spec\.ts$',
  transform: { '^.+\.(t|j)s$': ['ts-jest', { tsconfig: 'test/tsconfig.json', diagnostics: { ignoreCodes: [151001] } }] },
  // stellar-sdk usa paquetes que solo existen como ES modules: Jest los transforma.
  transformIgnorePatterns: ['node_modules/(?!(.*/)?(uint8array-extras|@noble|@scure|@exodus|smol-toml|eventsource)/)'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 60000,
};
