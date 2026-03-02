export const DEFAULT_LINE_TEMPLATE = '{room}の練習時間が10分後に始まります！準備してください🎸';

export function applyTemplate(
  template: string,
  vars: { room: string; band: string; hour: string }
): string {
  return template
    .replace(/\{room\}/g, vars.room)
    .replace(/\{band\}/g, vars.band)
    .replace(/\{hour\}/g, vars.hour);
}
