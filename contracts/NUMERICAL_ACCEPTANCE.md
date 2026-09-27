# Замороженные допуски до реализации stage03

Версия demo-policy-0.1.0. Проверки численные, не эксплуатационные гарантии.

- Без шума residual arithmetic: abs(actual-(observed-expected)) <=1e-6 degC. После одинакового initial thermal state baseline сравнивается с ручным recurrence <=1e-6 degC.
- Exact linear hourly residual r(t)=0.5*t(days): Theil-Sen24/72 slope=0.5 +/-1e-6 degC/day. Не трактовать наклон сырой температуры как наклон дефекта.
- No-noise load step/ambient change: после warm-up residual <=1e-6, устойчивой аномалии нет. Warm-up =5*tau (10ч публичной demo calibration), причина явно возвращается.
- Noise packaged normal/load-step: после warm-up медианный abs residual <=1degC; долгий положительный slope >0.5degC/day не должен возникать на последнем полном72ч окне. Failures исследовать, допуски не расширять без RFC.
- Progressive heat: на последнем валидном72ч окне residual >8degC, slope в [0.4,1.4] degC/day; hypothesis неподтвержденная.
- Drift: primary-independent difference >8degC на последнем окне, присутствует sensor disagreement; никаких auto-confirm.
- Spike/stuck: одиночный выброс не должен изменять72ч slope более0.2degC/day относительно контрольного ряда без этого выброса; stuck при изменяющемся независимом канале помечается suspect. Raw не затирается.
- Coverage<0.8 или <20 валидных часовых bins, span<24ч, primary age>600с: текущий score=null/unknown, не ноль; последняя валидная оценка отдельно. На72ч окне применяется coverage>=0.8, поэтому20 bins недостаточно для полного окна.
- Recovery: последний residual <2degC; ни закрытие случая, ни выполнение шагов не происходит автоматически.
- Acceleration: slope24 > slope72 на конце валидного ускоряющегося сценария; показываются оба вычисленных значения.
- Future leakage: добавление observations с eventTime>asOf или receivedAt>received_as_of не изменяет результат/хеш входа текущего анализа.
- Разные assetId с одинаковыми наблюдениями/calibration/consequence получают одинаковые числа и причины (за исключением идентификаторов).

Independent evaluation может читать truth только после получения результата, runtime не видит truth. Blind mismatch dataset отложен до независимой QA и не дает обещания промышленной точности. Все перечисленное является критериями будущего ядра, не результатами выполненных тестов stage01.
