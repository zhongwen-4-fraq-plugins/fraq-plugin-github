interface ContributionCalendar {
  totalContributions?: number;
  weeks?: Array<{ contributionDays?: Array<{ contributionLevel?: string }> }>;
}

export function drawContributions(user: string, calendar: ContributionCalendar): string {
  const symbols: Record<string, string> = {
    NONE: '·',
    FIRST_QUARTILE: '░',
    SECOND_QUARTILE: '▒',
    THIRD_QUARTILE: '▓',
    FOURTH_QUARTILE: '█',
  };
  const rows = Array.from({ length: 7 }, (_, day) =>
    (calendar.weeks ?? []).map((week) => symbols[week.contributionDays?.[day]?.contributionLevel ?? 'NONE']).join(''),
  );
  return `🟩 ${user} 最近一年贡献：${calendar.totalContributions ?? 0}\n${rows.join('\n')}`;
}
