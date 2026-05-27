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
