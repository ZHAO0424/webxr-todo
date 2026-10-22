// 村里的钟：完整的一天，只是各时段走得快慢不一样。

/**
 * 每段时间里，现实 1 秒 = 村里几分钟。
 *   白天放慢（人从村这头走到那头不至于花掉一个钟头），傍晚稍快，深夜快进。
 *   整天走一圈现实大约 50 分钟：清晨 2 分钟、白天 33 分钟、傍晚 6.4 分钟、吹灯 0.7 分钟、深夜 12 秒（放慢了，村民干活、走路的时间更宽裕）。
 */
export const RATES = [
  { from: 0, to: 5, rate: 30 }, // 深夜：快进
  { from: 5, to: 6.5, rate: 0.75 }, // 天蒙蒙亮：鸡叫、做早饭、出工
  { from: 6.5, to: 18, rate: 0.35 }, // 白天
  { from: 18, to: 21.5, rate: 0.55 }, // 傍晚、掌灯、晚上的活动
  { from: 21.5, to: 23, rate: 2 }, // 各家一盏盏吹灯、打更（约 45 秒）
  { from: 23, to: 24, rate: 30 }, // 夜深了：快进
];
export const NIGHT_FROM = 21.5, NIGHT_TO = 5; // 这段时间人都睡了

export const rateAt = (h) => RATES.find((r) => h >= r.from && h < r.to)?.rate ?? 1;

export class Clock {
  constructor(start = 15.5) { this.hour = start; this.day = 1; }

  /** 走 dt 秒（跨时段时分段算）。 */
  update(dt) {
    let left = dt;
    while (left > 1e-9) {
      const seg = RATES.find((r) => this.hour >= r.from && this.hour < r.to) ?? RATES[0];
      const perSec = seg.rate / 60; // 每秒走几小时
      const use = Math.min(left, (seg.to - this.hour) / perSec);
      this.hour += use * perSec;
      left -= use;
      if (this.hour >= 24 - 1e-9) { this.hour = 0; this.day++; }
      else if (use <= 0) this.hour += 1e-6; // 恰好在段边界上
    }
  }

  get rate() { return rateAt(this.hour); }
  get night() { return this.hour >= NIGHT_FROM || this.hour < NIGHT_TO; }
  get label() {
    const hh = Math.floor(this.hour), mm = Math.floor((this.hour - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
