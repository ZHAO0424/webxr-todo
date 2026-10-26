import { ACTIVITIES, R as pick } from './activities.js';

const R = (a, v) => (a?.length ? pick(a) : v.home.spot('yard')); // 河滩上的点都走不到时：在自家院里

/*
 * 老村址（east.js）几户原住户自己的活：
 *   柳婆婆：早晚给河神上香（庙前作揖，香炉冒烟）；白天到水则碑前、河滩老柳树底下看水
 *   水生：沿着河滩捞漂木（站在水边、拿竹篙往岸上扒），捞够了扛回家晒
 *   凤仙嫂：在鸭棚和河滩之间转，撒食、捡蛋
 * 葛石头錾石头、白老灰烧窑走通用的 work（activities.js 的 WORK 里写了位置和家伙）。
 * 产出（漂木 → 柴、鸭蛋、条石、石灰）见 economy.js 的 MAKE。
 */

ACTIVITIES.riverIncense = (v) => { // 河神庙前上香、作揖
  const O = v.V.oldSite;
  v.char.setItem(null);
  v.go(O.temple.at);
  v.call(() => O.light?.(v.V.hour()));
  v.do('bow', 3, { face: O.temple.face });
  v.loop = () => v.do('idle', 6, { face: O.temple.face });
};

ACTIVITIES.watchWater = (v) => { // 看水：水则碑前站一会儿，再拄着拐杖走到河滩上，望着河心
  const O = v.V.oldSite;
  v.char.setItem(v.p.item ?? null);
  v.loop = () => {
    if (v.rand() < 0.4) { v.go(O.stele.at); v.do('idle', 6, { face: O.stele.face }); return; }
    const [x, z] = R(O.beach, v);
    v.go([x, z]);
    v.do(v.rand() < 0.5 ? 'idle' : 'squat', 8, { face: [x, z + 4] });
  };
};

ACTIVITIES.driftwood = (v) => { // 捞漂木：河滩上一处处走，拿竹篙往岸上扒；隔一会儿扛一捆回家
  const O = v.V.oldSite;
  v.char.setItem('pole');
  let n = 0;
  v.loop = () => {
    const [x, z] = R(O.beach, v);
    v.go([x, z]);
    v.do('work', 7, { face: [x, z + 4] });
    if (++n % 4 === 0) { v.back('firewood'); v.go(v.home.spot('yard')); v.do('work', 2); v.back(null); }
  };
};

ACTIVITIES.tendDucks = (v) => { // 放鸭：鸭棚里撒食、捡蛋，再到河滩上看着鸭子
  const O = v.V.oldSite;
  v.char.setItem('basket');
  v.loop = () => {
    if (v.rand() < 0.45) { v.go(v.home.spot('pen')); v.do('work', 6); return; }
    const [x, z] = R(O.duckBeach, v);
    v.go([x, z]);
    v.do(v.rand() < 0.5 ? 'idle' : 'talk', 7, { face: [x, z + 4] });
  };
};

/** 修房子：在老宅院里干一天——和泥、砌墙、苫草顶（葛石头帮工）。plot：哪处老宅。 */
ACTIVITIES.repair = (v, plot) => {
  const c = v.V.C[plot], h = v.V.east.houses.find((x) => x.id === plot);
  v.errandText = v.p.id === 'ge_shitou' ? `帮${h?.ownerName ?? ''}修房子` : '请葛石头帮着修房子';
  v.char.setItem(v.p.id === 'ge_shitou' ? 'hammer' : 'hoe');
  v.loop = () => { v.go(c.randomPoint()); v.do('work', 8, { face: c.at(-1.04, 0) }); };
};

/**
 * 每帧：今天要修房子的，七点多两个人到院里开工，下午三点半收工、房子换成修好的样子（卡片、档案跟着变）。
 * V.repairs 由 economy.js 的 repairsReady 在凌晨排好。
 */
export function repairTick(V, h) {
  for (const r of V.repairs ?? []) {
    if (r.done) continue;
    const helpers = [r.owner, 'ge_shitou'].map((id) => V.byId[id]).filter(Boolean);
    if (!r.started && r.day === V.clockDay() && h >= 7.4 && h < 15) {
      r.started = true;
      for (const v of helpers) if (!v.errand) v.interrupt('repair', r.plot);
    }
    if ((r.started && h >= 15.5) || r.day !== V.clockDay()) {
      r.done = true;
      V.east.setPlotState(r.plot, 2);
      const owner = V.byId[r.owner];
      if (owner) owner.p.houseState = 2;
      for (const v of helpers) if (v.errand === 'repair') v.finish();
      V.onRepaired?.(owner, r.plot);
    }
  }
}
