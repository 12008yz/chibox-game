# Калибровка дропа (пункт A)

## Запуск отчёта

```bash
cd backend
npm run case:rtp-report              # локальная БД
npm run case:rtp-report:prod         # прод API (по умолчанию chibox-game.ru)
npm run case:rtp-report:prod -- https://chibox-game.ru/api
npm run case:rtp-report:json
```

## Что считает отчёт

- **RTP** = Σ (цена предмета × вероятность по весам) / цена кейса  
- Веса = те же, что в `openCase` (`calculateWeightForPaidCase` для платных, отдельные кривые для daily/bonus)  
- **Feel-bands** — доля дропа в зонах «катастрофа», «почти окуп», «джекпот» и т.д.

Синтетика (`--synthetic`) — только форма кривой весов, **не** отражает витрину.

## Калибровка v2 (`calculateWeightForPaidCase`)

- меньше катастроф (&lt;40% цены кейса по весам)  
- больше «почти окуп» (70–105%)  
- на **реалистичном** пуле (26 предметов, ratio 0.05–8) RTP ≈ **70%**

## Проверка прода (chibox-game.ru)

Наполнение в целом хорошее (до 140 предметов), но:

| Кейс | Замечание |
|------|-----------|
| Стандартный 99₽ | RTP ~**104%** — щедрое наполнение, не баг весов v2 (на старых весах ~97%) |
| Космический 601₽, Ледяной 2499₽ | **16 предметов**, RTP низкий, нет зоны 70–105% — нужно наполнение |
| Санитарный 101₽ | 16 предметов, RTP ~46% |

Пороги предупреждений в отчёте:

- RTP &gt; **85%** — риск маржи  
- RTP &lt; **55%** — слишком жёстко  
- «Катастрофа» &gt; **25%** по весам  
- &lt; **8** предметов — слабая рулетка  

## Модули

- `utils/caseEconomyAnalyzer.js`  
- `utils/dropWeightCalculator.js` — `calculateWeightForPaidCase`  
- `scripts/case-rtp-report.js`, `scripts/case-rtp-report-prod.js`

---

## Пункт B — near-miss в рулетке (frontend)

Файл `frontend/src/components/CasePreviewModal/buildRouletteNearMiss.ts`.

При остановке рулетки в соседних ячейках слева/справа от выигрыша показываются **дорогие** предметы из пула кейса (визуально). Серверный результат не меняется.

Отключение: `VITE_ROULETTE_NEAR_MISS=false` или `prefers-reduced-motion: reduce`.

---

## Пункт C — soft-pity (сессионный буст)

Модуль `services/softPityService.js`, интеграция в `openCase.js`.

После **N** подряд открытий платного кейса без предмета ≥ **85%** цены кейса игроку на **1–2** следующих открытия добавляется небольшой буст к весам (как доп. % к `calculateModifiedDropWeights`). Состояние хранится в Redis (ключ `drop_pity:{userId}`) или in-memory fallback, TTL сессии 24 ч.

### Включение

```env
DROP_SOFT_PITY_ENABLED=true
```

По умолчанию **выключено** (`false`).

### Переменные

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `DROP_SOFT_PITY_PAID_ONLY` | `true` | Только покупные кейсы |
| `DROP_SOFT_PITY_THRESHOLD` | `5` | Подряд «плохих» открытий до pity |
| `DROP_SOFT_PITY_MIN_WIN_RATIO` | `0.85` | Порог «нормального» дропа (доля цены кейса) |
| `DROP_SOFT_PITY_BOOST_PERCENT` | `3` | Доп. % к весам на pity-открытии |
| `DROP_SOFT_PITY_MAX_BOOST_PERCENT` | `5` | Потолок pity-буста |
| `DROP_SOFT_PITY_DURATION_OPENS` | `2` | Сколько открытий с бустом |
| `DROP_SOFT_PITY_SESSION_TTL_HOURS` | `24` | Сброс сессии без открытий |

Платные кейсы: итоговый бонус к весам не выше **12% + MAX_PITY** (обычно до **17%**).

### API

При активном pity в ответе `openCase`: `data.soft_pity_boost_percent` (только если буст применён).

### Проверка

```bash
node scripts/test-soft-pity.js
```

### Ограничения

- Состояние **на пользователя** (не на шаблон кейса): серия считается по всем платным открытиям в сессии.
- При нескольких инстансах бэкенда без Redis pity может расходиться (in-memory только на одном процессе).
- Превью шансов: для кейса из инвентаря с `source=subscription` передайте `?source=subscription` в `GET /case-templates/:id/items`, иначе шаблон с ценой >0 может считаться «платным» в превью.
