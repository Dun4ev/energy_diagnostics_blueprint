const pluralRules = new Intl.PluralRules('ru');

export function countLabel(count: number, forms: readonly [string, string, string]): string {
  const category = pluralRules.select(count);
  const word = category === 'one' ? forms[0] : category === 'few' ? forms[1] : forms[2];
  return `${count} ${word}`;
}
