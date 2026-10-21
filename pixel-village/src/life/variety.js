import { friendsOf } from '../residents.js';
import { hash, lunarOf } from './events.js';

/*
 * 每天一样又不完全一样：派活之前先过一遍这里，按天气、日子、各人的固定随机数换掉一些活动。
 *   下雨：户外的事（下地、放羊、闲坐、下棋、玩……）改成待在屋里；做饭、喂牲口、上学、铺子里干活照常（出门打伞）
 *   学堂逢十放假（初十、二十、三十，正好赶上赶集）
 *   男人隔三差五进山砍柴；媳妇们隔几天去溪边洗衣裳；老人有时去老伙计家串门
 * 同一天、同一个人、同一条日程结果固定（hash），模拟能复现。
 */

const OUTDOOR = new Set(['field', 'haul', 'herd', 'herdHome', 'thresh', 'oxHome', 'play', 'garden', 'yardWork', 'sitGate', 'chess', 'patrol', 'evening', 'sellTofu', 'tendBees', 'peddle', 'peddlerChat', 'visit', 'dinner']);
const FIREWOOD = new Set(['yang_erniu', 'wu_dachuan', 'liu_youfu']);
const LAUNDRY = new Set(['li_guilan', 'he_xiulan', 'feng_yuzhen', 'liu_cuihua', 'sun_qiaoyun', 'chen_daniang']);
const ELDERS = new Set(['wang_deshan', 'chen_mancang', 'chen_daniang', 'zhou_jishi', 'zheng_laotou']);

export const holiday = (day) => lunarOf(day).d % 10 === 0;

/** 今天这一条日程实际干什么：返回 [活动, 参数]。 */
export function variant(v, name, arg, day, idx) {
  const p = v.p, h = (tag) => hash(`${day}/${p.id}/${idx}/${tag}`);
  if (v.V.weather() === 'rain') {
    if (OUTDOOR.has(name) || (name === 'work' && p.home === 'square')) return ['home', null]; // 剃头匠下雨不出摊
  }
  if (holiday(day) && name === 'school') return ['play', null];
  if (holiday(day) && name === 'teach') return ['read', null];
  if (name === 'field' && FIREWOOD.has(p.id) && h('wood') < 0.3) return ['firewood', null];
  if (LAUNDRY.has(p.id) && (name === 'yardWork' || name === 'field') && h('wash') < 0.35) return ['laundry', null];
  if (ELDERS.has(p.id) && (name === 'sitGate' || name === 'chess') && h('visit') < 0.3) {
    const fr = friendsOf(p.id);
    if (fr.length) return ['visitFriend', fr[Math.floor(h('who') * fr.length)]];
  }
  return [name, arg];
}
