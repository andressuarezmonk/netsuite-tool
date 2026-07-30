export const ACCOUNT_ID = '3851137';
export const HANDLER = `https://${ACCOUNT_ID}.app.netsuite.com/app/site/hosting/scriptlet.nl?script=2373&deploy=1`;
export const TARGET_SCRIPT = '2375';
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = typeof DAYS[number];
