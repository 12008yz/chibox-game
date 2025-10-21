/**
 * Seeded Random Number Generator (алгоритм Mulberry32)
 * Генерирует детерминированные случайные числа на основе seed
 */
function seededRandom(seed) {
   return function() {
     seed = (seed + 0x6D2B79F5) | 0;
     let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
     t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
 }
 
 /**
  * Конвертирует строку в число для использования как seed
  */
 function stringToSeed(str) {
   let hash = 0;
   if (str.length === 0) return hash;
   for (let i = 0; i < str.length; i++) {
     const char = str.charCodeAt(i);
     hash = ((hash << 5) - hash) + char;
     hash = hash & hash; // Convert to 32bit integer
   }
   return Math.abs(hash);
 }
 
 /**
  * Перемешивает массив используя Fisher-Yates алгоритм с seeded random
  * @param {Array} array - массив для перемешивания
  * @param {string} seed - строка-seed (например, ID кейса)
  * @returns {Array} - перемешанная копия массива
  */
 function seededShuffle(array, seed) {
   // Создаем копию массива, чтобы не изменять оригинал
   const shuffled = [...array];
 
   // Создаем seeded генератор случайных чисел
   const random = seededRandom(stringToSeed(seed));
 
   // Fisher-Yates shuffle с seeded random
   for (let i = shuffled.length - 1; i > 0; i--) {
     const j = Math.floor(random() * (i + 1));
     [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
   }
 
   return shuffled;
 }
 
 module.exports = {
   seededShuffle,
   seededRandom,
   stringToSeed
 };
 