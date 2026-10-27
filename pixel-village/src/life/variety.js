import { friendsOf } from '../residents.js';
import { hash, lunarOf } from './events.js';
import { season } from '../season.js';

/*
 * 每天一样又不完全一样：派活之前先过一遍这里，按天气、日子、各人的固定随机数换掉一些活动。
 *   下雨：户外的事（下地、放羊、闲坐、下棋、玩……）改成待在屋里；做饭、喂牲口、上学、铺子里干活照常（出门打伞）
 *   学堂逢十放假（初十、二十、三十，正好赶上赶集）
 *   男人隔三差五进山砍柴；媳妇们隔几天去溪边洗衣裳；老人有时去老伙计家串门
 *   四季（seasonal）：日程里写的是秋天的活，换了季节，下地 / 挑担 / 打场这些换成当季的农活：
 *     春：翻地、点种、挑粪；夏：割麦、锄草、背麦个子；秋：割谷子、掰玉米、挑谷子；
 *     冬：没有地里的活了——男人进山砍柴，其余的扫雪、拾粪；晚饭在屋里炕上吃
 * 同一天、同一个人、同一条日程结果固定（hash），模拟能复现。
 */

const OUTDOOR = new Set(['field', 'haul', 'herd', 'herdHome', 'thresh', 'oxHome', 'play', 'garden', 'yardWork', 'sitGate', 'chess', 'patrol', 'evening', 'sellTofu', 'tendBees', 'peddle', 'peddlerChat', 'visit', 'dinner', 'firewood', 'fish']);
const FIREWOOD = new Set(['yang_erniu', 'wu_dachuan', 'liu_youfu']);
const LAUNDRY = new Set(['li_guilan', 'he_xiulan', 'feng_yuzhen', 'liu_cuihua', 'sun_qiaoyun', 'chen_daniang']);
const ELDERS = new Set(['wang_deshan', 'chen_mancang', 'chen_daniang', 'zhou_jishi', 'zheng_laotou']);

export const holiday = (day) => lunarOf(day).d % 10 === 0;

/** 今天这一条日程实际干什么：返回 [活动, 参数]。 */
export function variant(v, name, arg, day, idx) {
  const p = v.p, h = (tag) => hash(`${day}/${p.id}/${idx}/${tag}`);
  if (v.V.weather() === 'rain') {
    const hardy = name === 'field' && p.body !== 'child' && !p.elder && p.body !== 'elder' && ['spring', 'summer'].includes(season()) && h('rainwork') < 0.5; // 春夏抢农时：一半壮劳力披上蓑衣照样下地
    if (!hardy && (OUTDOOR.has(name) || (name === 'work' && p.home === 'square'))) return ['home', null]; // 剃头匠下雨不出摊
  }
  if (holiday(day) && name === 'school') return ['play', null];
  if (holiday(day) && name === 'teach') return ['read', null];
  if (name === 'field' && FIREWOOD.has(p.id) && h('wood') < 0.3) return ['firewood', null];
  if (LAUNDRY.has(p.id) && (name === 'yardWork' || name === 'field') && h('wash') < 0.35) return ['laundry', null];
  if (ELDERS.has(p.id) && (name === 'sitGate' || name === 'chess') && h('visit') < 0.3) {
    const fr = friendsOf(p.id);
    if (fr.length) return ['visitFriend', fr[Math.floor(h('who') * fr.length)]];
  }
  return seasonal(p, name, arg, h);
}

const WINTER_OFF = new Set(['field', 'garden', 'haul', 'mill', 'tendBees', 'thresh', 'oxHome', 'laundry']); // 冬天没有的活（地冻了、溪冻了、磨坊的水轮冻住了）
/** 按季节换农活。 */
function seasonal(p, name, arg, h) {
  const S = season(), kid = p.body === 'child';
  if (S === 'spring') {
    if (name === 'field') return [p.item === 'hoe' || h('plow') < 0.4 ? 'plowHoe' : 'sow', arg];
    if (name === 'haul') return ['haulManure', null];
    if (name === 'thresh') return arg === 'help' ? ['yardWork', null] : ['plowHoe', 'fieldW'];
    if (name === 'oxHome') return ['yardWork', null];
  }
  if (S === 'summer') {
    if (name === 'field' && arg !== 'fieldSoy') return [h('reap') < 0.6 ? 'reapWheat' : 'weed', arg];
    if (name === 'haul') return ['carrySheaves', null];
  }
  if (S === 'autumn' && name === 'field' && arg !== 'fieldSoy' && !kid) {
    const r = h('crop');
    return [r < 0.4 ? 'reap' : r < 0.7 ? 'pickCorn' : 'field', arg];
  }
  if (S === 'winter') {
    if (WINTER_OFF.has(name)) {
      const r = h('winter');
      if (p.sex === '男' && !kid && p.age < 60 && r < 0.4) return ['firewood', null];
      return [kid ? 'play' : r < 0.7 ? 'sweepSnow' : 'gatherDung', null];
    }
    if (name === 'dinner') return ['home', null];
  }
  return [name, arg];
}
