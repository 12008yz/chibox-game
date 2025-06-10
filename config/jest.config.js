module.exports = {
   testEnvironment: 'node',
   setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
   testMatch: [
     '<rootDir>/tests/**/*.test.js',
     '<rootDir>/tests/**/*.spec.js'
   ],
   collectCoverageFrom: [
     'controllers/**/*.js',
     'services/**/*.js',
     'middleware/**/*.js',
     'utils/**/*.js',
     '!**/node_modules/**',
     '!**/tests/**',
     '!**/coverage/**'
   ],
   coverageDirectory: 'coverage',
   coverageReporters: ['text', 'lcov', 'html'],
   verbose: true,
   forceExit: true,
   clearMocks: true,
   resetMocks: true,
   restoreMocks: true,
   testTimeout: 10000,
   // Игнорируем определенные файлы и папки
   testPathIgnorePatterns: [
     '<rootDir>/node_modules/',
     '<rootDir>/migrations/',
     '<rootDir>/seeders/'
   ],
   // Настройки для работы с модулями
   moduleFileExtensions: ['js', 'json'],
   // Покрытие кода
   collectCoverage: false, // включаем при необходимости
   coverageThreshold: {
     global: {
       branches: 70,
       functions: 70,
       lines: 70,
       statements: 70
     }
   }
 };
 