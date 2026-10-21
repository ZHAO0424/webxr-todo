// 人、动物共用：把逻辑位置画到模型上。

/**
 * 把逻辑位置画到模型上（人、动物共用）。之前直接按像素网格取整位置、按 22.5° 取整朝向，
 * 走起来一顿一顿的、拐弯时左右抖。现在：
 *   - 位置不取整（像素感已经由材质里的纹素对齐保证），高度平滑跟上（上下台阶不跳）；
 *   - 朝向先平滑转过去，再按 22.5° 分档，并且带回差——要多转过半档才换下一档，不会在两档之间来回跳。
 */
const STEP_Q = Math.PI / 8;
export function present(a, dt, y) {
  const o = a.object;
  let diff = a.heading - (a.shownHeading ?? a.heading);
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  a.shownHeading = (a.shownHeading ?? a.heading) + diff * Math.min(1, dt * 10);
  const cur = o.rotation.y, d2 = Math.atan2(Math.sin(a.shownHeading - cur), Math.cos(a.shownHeading - cur));
  if (Math.abs(d2) > STEP_Q * 0.75) o.rotation.y = Math.round(a.shownHeading / STEP_Q) * STEP_Q;
  const jump = Math.abs(y - o.position.y) > 2 || !a.placed; // 头一帧、进出屋：直接放到位
  o.position.set(a.pos.x, jump ? y : o.position.y + (y - o.position.y) * Math.min(1, dt * 12), a.pos.z);
  a.placed = true;
}
