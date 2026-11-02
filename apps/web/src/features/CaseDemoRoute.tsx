import './case-demo-route.css';

export type DemoStep = 1 | 2 | 3 | 4;

export function parseDemoStep(search: string): DemoStep | null {
  const values = new URLSearchParams(search).getAll('demoStep');
  if (values.length !== 1 || !/^[1-4]$/.test(values[0])) return null;
  return Number(values[0]) as DemoStep;
}

export function demoStepHref(currentUrl: string, step: DemoStep | null): string {
  const url = new URL(currentUrl);
  if (step === null) url.searchParams.delete('demoStep');
  else url.searchParams.set('demoStep', String(step));
  return `${url.pathname}${url.search}`;
}

const steps: { step: DemoStep; title: string; explanation: string }[] = [
  {
    step: 1,
    title: 'Что обнаружено',
    explanation: 'Начните с наблюдаемого отклонения и инженерного вывода. В REFERENCE показаны значения презентации; гипотеза еще требует проверки.',
  },
  {
    step: 2,
    title: 'На чем основано',
    explanation: 'Сопоставьте временную ленту, доступные записи и происхождение анализа. Реконструкция слайда в REFERENCE не заменяет реальные измерения.',
  },
  {
    step: 3,
    title: 'Чего не хватает',
    explanation: 'Проверьте ограничения метода и недостающие доказательства в карточке. Отсутствие данных означает неопределенность; подтвержденного дефекта из него не следует.',
  },
  {
    step: 4,
    title: 'Что проверить дальше',
    explanation: 'Изучите следующие проверки и связанные планы в карточке. Разбор не создает план и не согласовывает работы. Для расчетного примера можно выбрать набор SIMULATION.',
  },
];

export function CaseDemoNavigation({ step, stepHrefs, closeHref }: {
  step: DemoStep; stepHrefs: Record<DemoStep, string>; closeHref: string;
}) {
  return <nav className="case-demo-route-actions" aria-label="Навигация текущего шага">
    <span>Шаг {step} из 4</span>
    {step > 1 && <a href={stepHrefs[(step - 1) as DemoStep]}>Назад</a>}
    {step < 4
      ? <a className="case-demo-route-next" href={stepHrefs[(step + 1) as DemoStep]}>Далее</a>
      : <a className="case-demo-route-next" href={closeHref}>Завершить разбор</a>}
  </nav>;
}

export function CaseDemoRoute({ step, stepHrefs, closeHref }: {
  step: DemoStep;
  stepHrefs: Record<DemoStep, string>;
  closeHref: string;
}) {
  const current = steps[step - 1];
  return <section className="case-demo-route" aria-labelledby="case-demo-route-title">
    <div className="case-demo-route-header">
      <h2 id="case-demo-route-title">Разбор случая</h2>
      <a className="case-demo-route-close" href={closeHref}>Закрыть разбор</a>
    </div>
    <nav aria-label="Шаги разбора">
      <ol className="case-demo-route-steps">
        {steps.map(item => <li key={item.step}>
          <a href={stepHrefs[item.step]} aria-current={item.step === step ? 'step' : undefined}>
            <span className="case-demo-route-number" aria-hidden="true">{item.step}</span>
            <span>{item.title}</span>
          </a>
        </li>)}
      </ol>
    </nav>
    <div className="case-demo-route-content">
      <h3>{current.title}</h3>
      <p>{current.explanation}</p>
      <p className="case-demo-route-context">REFERENCE · иллюстрация презентации. Карточка и доказательства доступны на любом шаге.</p>
    </div>
    <CaseDemoNavigation step={step} stepHrefs={stepHrefs} closeHref={closeHref} />
  </section>;
}
