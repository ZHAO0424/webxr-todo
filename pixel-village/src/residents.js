/*
 * 石峪村村民名册（虚构，旧时太行山里的一个石头村）。28 人，12 户 + 2 个外来手艺人。
 *
 * 每个人：
 *   身份   name 全名 / nick 村里怎么叫 / age / sex / home 住哪户 / relation 在家里的身份
 *   职业   job 职业 / skills 手艺
 *   性格   traits / bio 来历 / likes 喜欢
 *   家当   owns 养的牲口、种的地
 *   日程   day 下午到夜里怎么过：[[开始钟点, 活动, 参数?], …]；上午和中午在文件末尾的 MORNING 里，两段拼成完整的一天
 *          （活动的含义见 life/activities.js；第一项之前、最后一项"回屋"之后在屋里睡觉）
 *   外观   body / skin / hair / hat / top / style / pants / apron / sash / item / …（见 characters.js）
 *
 * 村里过的是完整的一天（时钟见 life/clock.js：白天走得慢、深夜快进）。每天还有一样全村的活动（见 life/events.js）。
 */

export const VILLAGE = {
  name: '石峪村',
  intro: '石峪村坐落在太行山深处，房屋以山间毛石垒砌，屋顶覆着石板瓦。村前溪水流过，溪上一座石拱桥是进村的唯一通道。'
    + '时值秋收，梯田里的玉米、高粱、谷子尽数泛黄，家家房顶晒满玉米，场院上耕牛拉着石碾往复轧场。',
};

export const HOUSEHOLDS = [
  {
    id: 'headman', name: '王家（村长家）', kind: '青砖四合院',
    note: '全村最气派的宅院，广亮大门、影壁、带前廊的正房与东西厢房一应俱全。祠堂、水井等村中公共事务，向来由王家主持。',
    people: [
      {
        id: 'wang_deshan', name: '王德山', nick: '王村长', age: 58, sex: '男', relation: '户主',
        job: '村长兼族长', skills: ['调解纠纷', '记账', '象棋'],
        traits: ['稳重', '好面子', '言语从容'],
        bio: '王家祖上三代主持村务，地界纠纷、婚丧嫁娶，村民都先来请他拿主意。每日傍晚，他总揣着旱烟袋到大槐树下与陈老汉对弈。',
        likes: '象棋、旱烟、梆子戏',
        owns: ['一只狸花猫（花狸）'],
        day: [[15, 'patrol'], [16.5, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'elder', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'brown', style: 'gown', pants: 'black', item: 'pipe', mustache: true,
      },
      {
        id: 'li_guilan', name: '李桂兰', nick: '王婶', age: 54, sex: '女', relation: '王德山的媳妇',
        job: '持家', skills: ['剪窗花', '面食'],
        traits: ['精明', '热心', '嗓门洪亮'],
        bio: '娘家在山外的李家庄。村里谁家操办酒席，都请她来主厨；每逢过年，全村半数的窗花出自她手。',
        likes: '串门、剪纸',
        owns: [],
        day: [[15, 'yardWork'], [16, 'shopping'], [16.8, 'visit', 'tofu'], [17.6, 'cook'], [18.4, 'dinner'], [19.0, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'indigo', style: 'side', pants: 'black', item: 'basket', blush: true,
      },
      {
        id: 'wang_xiaomei', name: '王小梅', nick: '小梅', age: 9, sex: '女', relation: '王德山的孙女',
        job: '学童', skills: ['背诗'],
        traits: ['文静', '爱整洁'],
        bio: '父母在县城做事，她随祖父母留在村里生活。学堂里数她的字写得最工整，常得先生夸奖。',
        likes: '跳房子、先生讲的故事',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.6, 'chore', 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'pink', style: 'side', pants: 'indigo', blush: true, smile: true,
      },
    ],
  },
  {
    id: 'school', name: '学堂（王家祠堂）', kind: '青砖祠堂',
    note: '王家祠堂的大殿平日辟作学堂，李先生住在东厢房。',
    people: [
      {
        id: 'li_wenqing', name: '李文清', nick: '李先生', age: 46, sex: '男', relation: '独居',
        job: '教书先生', skills: ['教书', '写对联', '珠算'],
        traits: ['斯文', '严厉', '心软'],
        bio: '早年在县城读过书，后应王村长之邀来村里教书。每逢过年，家家户户的春联都由他执笔，分文不取，只收两个馍。',
        likes: '书法、清茶',
        owns: [],
        day: [[15, 'teach'], [16.5, 'read'], [17.4, 'visit', 'doctor'], [18.4, 'dinner'], [19.0, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'indigo', style: 'gown', pants: 'black', item: 'book',
      },
    ],
  },
  {
    id: 'smith', name: '张家铁匠铺', kind: '石头房 + 敞口炉棚',
    note: '坐落在村口路旁，全村的镰刀、锄头和马掌都在这里打制。',
    people: [
      {
        id: 'zhang_tiechui', name: '张铁锤', nick: '张铁匠', age: 45, sex: '男', relation: '户主',
        job: '铁匠', skills: ['打农具', '钉马掌', '淬火'],
        traits: ['寡言', '力大', '脾气耿直'],
        bio: '打铁手艺承自父亲。秋收前后是铺子最忙的时候，全村的镰刀都等着开刃。妻子几年前病故，他独自抚养儿子大宝。',
        likes: '烧酒、儿子的读书声',
        owns: ['一条黄狗（大黄）'],
        day: [[15, 'work'], [17.2, 'fetchWater'], [17.6, 'work'], [18.6, 'dinner'], [19.1, 'evening'], [20.5, 'home']],
        body: 'man', skin: 'skinTan', hair: 'shaved', top: 'grey', style: 'vest', vest: 'black', pants: 'black', apron: 'leather', item: 'hammer', mustache: true,
      },
      {
        id: 'xiao_shun', name: '刘小顺', nick: '小顺', age: 17, sex: '男', relation: '徒弟（寄住）',
        job: '铁匠学徒', skills: ['拉风箱', '抡大锤'],
        traits: ['机灵', '贪玩', '饭量大'],
        bio: '邻村的孤儿，十三岁来铁匠铺拜师学艺。拉了整整四年风箱，最近师傅终于让他抡起了大锤。',
        likes: '货郎讲的山外见闻',
        owns: [],
        day: [[15, 'work', 'bellows'], [17.0, 'peddlerChat'], [17.6, 'work', 'bellows'], [18.6, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', apron: 'leather', item: 'hammer',
      },
      {
        id: 'zhang_dabao', name: '张大宝', nick: '大宝', age: 10, sex: '男', relation: '张铁锤的儿子',
        job: '学童', skills: ['爬树', '弹弓'],
        traits: ['调皮', '胆大', '爱护幼小'],
        bio: '学堂里的孩子王。一放学便领着一群年纪小的伙伴满村奔跑，为此没少挨先生的戒尺。',
        likes: '柿子树、蚂蚱',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.8, 'chore', 'fetchWater'], [18.6, 'dinner'], [19.0, 'evening'], [20.1, 'home']],
        body: 'child', skin: 'skinTan', hair: 'tuft', top: 'red', pants: 'indigo', smile: true,
      },
    ],
  },
  {
    id: 'carpenter', name: '刘家木匠铺', kind: '石头房 + 敞口料场',
    note: '院里堆满原木与车轮。村里的大车、犁具、桌椅板凳，乃至嫁娶用的箱柜，都出自这座木匠铺。',
    people: [
      {
        id: 'liu_youfu', name: '刘有福', nick: '刘木匠', age: 42, sex: '男', relation: '户主',
        job: '木匠', skills: ['造大车', '修犁', '打家具'],
        traits: ['细致', '较真', '乐天'],
        bio: '一手榫卯功夫远近闻名。眼下正为杨家修理大车轮子，要赶在秋收开始之前交工。',
        likes: '新式样、小曲',
        owns: [],
        day: [[15, 'work'], [17.0, 'shopping'], [17.4, 'work'], [18.5, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'khaki', pants: 'black', sash: 'black', item: 'saw',
      },
      {
        id: 'he_xiulan', name: '何秀兰', nick: '刘嫂', age: 39, sex: '女', relation: '刘有福的媳妇',
        job: '持家、种菜', skills: ['纳鞋底', '腌咸菜'],
        traits: ['勤快', '爱操心'],
        bio: '刘木匠的妻子，在西坡种着一块白菜地。每年秋后，她都要腌上两大缸酸菜，供全家过冬。',
        likes: '与王婶闲话家常',
        owns: ['西坡一块菜地'],
        day: [[15, 'fetchWater'], [15.6, 'field', 'fieldWest'], [17.0, 'cook'], [18.5, 'dinner'], [19.0, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', hat: 'scarf', scarfRamp: 'red', top: 'indigo', style: 'side', pants: 'black', item: 'basket',
      },
      {
        id: 'liu_erya', name: '刘二丫', nick: '二丫', age: 9, sex: '女', relation: '刘有福的闺女',
        job: '学童', skills: ['跳绳'],
        traits: ['爱笑', '黏人'],
        bio: '刘木匠的女儿，整天跟在大宝身后奔跑。大宝爬树时，她就守在树下仰头张望。',
        likes: '红头绳、甜枣',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.8, 'chore', 'feedChickens'], [18.5, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'green', style: 'side', pants: 'black', blush: true,
      },
    ],
  },
  {
    id: 'tofu', name: '赵家豆腐坊', kind: '土坯房 + 驴拉磨',
    note: '每天下午磨豆，傍晚点卤，灶上终日热气蒸腾。所用大豆都产自自家村西坡上的豆子地。',
    people: [
      {
        id: 'zhao_mantun', name: '赵满囤', nick: '赵豆腐', age: 40, sex: '男', relation: '户主',
        job: '豆腐匠', skills: ['磨豆', '点卤', '压豆腐'],
        traits: ['和气', '早起', '爱吆喝'],
        bio: '豆腐手艺祖传。下午赶驴磨豆，傍晚上灶煮浆点卤，次日清早再挑着担子到山外的集市售卖。',
        likes: '与驴说话',
        owns: ['一头灰驴（灰灰）', '村西坡上一块大豆地'],
        day: [[15, 'grind'], [16.8, 'boil'], [18.5, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', apron: 'white', item: 'ladle', smile: true,
      },
      {
        id: 'feng_yuzhen', name: '冯玉珍', nick: '豆腐嫂', age: 36, sex: '女', relation: '赵满囤的媳妇',
        job: '豆腐坊帮手', skills: ['压豆腐', '做豆腐脑'],
        traits: ['爽利', '爱说笑'],
        bio: '村里公认她做的豆腐脑最嫩。每到傍晚，她便端着一盆豆腐来到戏台前，谁家需要就现切一块。',
        likes: '戏曲',
        owns: [],
        day: [[15, 'work', 'stove'], [16.8, 'feedChickens'], [17.3, 'sellTofu'], [18.5, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'pink', style: 'side', pants: 'indigo', apron: 'white', item: 'bowl', blush: true, smile: true,
      },
      {
        id: 'zhao_shitou', name: '赵石头', nick: '石头', age: 8, sex: '男', relation: '赵满囤的儿子',
        job: '学童', skills: ['赶驴'],
        traits: ['憨厚', '老实', '力大'],
        bio: '赵豆腐的儿子。先生布置的课文总也背不熟，赶驴推磨却是一把好手。',
        likes: '豆腐脑、骑驴',
        owns: [],
        day: [[15, 'school'], [16.5, 'chore', 'work'], [17.6, 'play'], [18.5, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skinTan', hair: 'shaved', top: 'khaki', pants: 'indigo',
      },
    ],
  },
  {
    id: 'store', name: '孙家杂货铺', kind: '临路青砖铺面',
    note: '油盐酱醋、针头线脑、火柴烟叶一应俱全，门前挂着两面红幌子。',
    people: [
      {
        id: 'sun_youcai', name: '孙有财', nick: '孙掌柜', age: 50, sex: '男', relation: '户主',
        job: '杂货铺掌柜', skills: ['算盘', '记账', '进货'],
        traits: ['精打细算', '笑脸迎人'],
        bio: '每月两次前往山外的县城进货。乡亲们手头拮据时可以先行赊账，到年底再一并结清。',
        likes: '算账、时事新闻',
        owns: ['一只橘猫（大橘）'],
        day: [[15, 'work'], [18.6, 'dinner'], [19.3, 'work'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'brown', style: 'gown', pants: 'black', mustache: true,
      },
      {
        id: 'xiao_liuzi', name: '周六子', nick: '小六子', age: 19, sex: '男', relation: '伙计（住铺里）',
        job: '杂货铺伙计', skills: ['搬货', '吆喝'],
        traits: ['嘴甜', '勤快'],
        bio: '周郎中的远房侄子，在杂货铺学做买卖。扫街、搬货、送货都由他包揽；天色一暗，还要挨个点亮路口的火把。',
        likes: '戏台上的热闹',
        owns: [],
        day: [[15, 'work', 'sweep'], [16.2, 'deliver', 'headman'], [16.8, 'work', 'sweep'], [18.1, 'lightTorches'], [19.0, 'dinner'], [19.3, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', top: 'indigo', pants: 'black', sash: 'red', item: 'broom', smile: true,
      },
      {
        id: 'sun_shuanzi', name: '孙栓子', nick: '栓子', age: 11, sex: '男', relation: '孙有财的儿子',
        job: '学童', skills: ['算盘'],
        traits: ['好读书', '胆小'],
        bio: '孙掌柜的儿子。父亲盼他将来接管杂货铺，他却一心想像李先生那样当个教书先生。',
        likes: '书本、小人书',
        owns: [],
        day: [[15, 'school'], [16.5, 'read'], [17.5, 'play'], [18.6, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'short', top: 'indigo', pants: 'black', item: 'book', smile: true,
      },
    ],
  },
  {
    id: 'doctor', name: '周家药铺', kind: '石头铺面 + 晒药院',
    note: '院中摆着晾晒药材的竹匾，后院养着几箱蜜蜂，所产蜂蜜专用来调制蜜丸。',
    people: [
      {
        id: 'zhou_jishi', name: '周济世', nick: '周郎中', age: 70, sex: '男', relation: '独居',
        job: '郎中', skills: ['号脉', '采药', '制蜜丸', '养蜂'],
        traits: ['慈祥', '讲究', '耳背'],
        bio: '在村中行医四十年，村里半数的人都由他接生。每日傍晚，他背着药箱去陈大娘家，为她诊治多年的老寒腿。',
        likes: '晒太阳、蜂箱',
        owns: ['三箱蜜蜂'],
        day: [[15, 'work'], [16.6, 'tendBees'], [17.2, 'visit', 'farmA'], [18.4, 'dinner'], [19.1, 'evening'], [20.2, 'home']],
        body: 'elder', skin: 'skin', hair: 'white', hairRamp: 'grey', hat: 'skullcap', top: 'grey', style: 'gown', pants: 'black', item: 'box', beard: true, elder: true,
      },
    ],
  },
  {
    id: 'shepherd', name: '马家羊圈', kind: '半山腰的石头平房 + 羊圈',
    note: '位于村西半山腰，是离村子最远的一户。圈里养着九只山羊和绵羊。',
    people: [
      {
        id: 'ma_laoliu', name: '马老六', nick: '羊倌老马', age: 50, sex: '男', relation: '独居',
        job: '羊倌', skills: ['放羊', '甩鞭', '山歌'],
        traits: ['孤僻', '嗓音嘹亮', '心善'],
        bio: '终身未娶，与羊群相伴半生。下午赶羊上坡吃草，日落之前一声响鞭，羊群便应声归圈。',
        likes: '山歌、黑狗黑子',
        owns: ['九只羊', '一条黑狗（黑子）'],
        day: [[15, 'herd'], [17.0, 'herdHome'], [17.8, 'dinner'], [18.1, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'white', style: 'vest', vest: 'khaki', pants: 'black', legwrap: true, item: 'whip',
      },
    ],
  },
  {
    id: 'farmA', name: '陈家', kind: '石头房 + 猪圈 + 菜园',
    note: '老两口相依度日，儿子在山外做学徒。院里养着两头黑猪和一窝鸡，墙外有一小块菜园。',
    people: [
      {
        id: 'chen_mancang', name: '陈满仓', nick: '陈老汉', age: 72, sex: '男', relation: '户主',
        job: '老农（种菜、喂猪）', skills: ['看天象', '编筐'],
        traits: ['倔强', '爱抬杠', '棋艺平平'],
        bio: '种了一辈子地，如今腿脚不便，只打理院外的菜园。与王村长对弈三十年，输多赢少，嘴上却从不认输。',
        likes: '旱烟、象棋、晒太阳',
        owns: ['两头黑猪'],
        day: [[15, 'garden'], [16.2, 'feedPigs'], [16.6, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'elder', skin: 'skinTan', hair: 'white', hairRamp: 'grey', hat: 'felt', top: 'black', pants: 'black', item: 'pipe', beard: true, elder: true,
      },
      {
        id: 'chen_daniang', name: '赵凤英', nick: '陈大娘', age: 70, sex: '女', relation: '陈满仓的老伴',
        job: '持家', skills: ['纺线', '蒸花馍'],
        traits: ['唠叨', '疼爱孩子'],
        bio: '腿脚患有老寒病，出门须拄拐杖。村里的孩子路过她家门口，总能讨到一颗红枣。',
        likes: '晒太阳、孩子们的嬉闹',
        owns: ['一窝鸡'],
        day: [[15, 'sitGate'], [16.4, 'feedChickens'], [17.0, 'sitGate'], [17.6, 'cook'], [18.4, 'dinner'], [19.0, 'home']],
        body: 'woman', skin: 'skinTan', hair: 'bun', hairRamp: 'grey', hat: 'scarf', scarfRamp: 'black', top: 'black', style: 'side', pants: 'black', item: 'cane', elder: true,
      },
    ],
  },
  {
    id: 'farmB', name: '杨家', kind: '土坯房 + 牛棚',
    note: '村东的庄稼人家。西坡的玉米地和高粱地归杨家所有，院里搭着牛棚，养着一头老黄牛。',
    people: [
      {
        id: 'yang_erniu', name: '杨二牛', nick: '杨二哥', age: 34, sex: '男', relation: '户主',
        job: '庄稼汉', skills: ['犁地', '赶牛', '轧场'],
        traits: ['憨厚', '能干', '好面子'],
        bio: '家中排行老二。今年玉米、高粱双双丰收，这几日下午，他都赶着老黄牛到场院上轧场。',
        likes: '老黄牛、烧酒',
        owns: ['一头黄牛（老黄）', '西坡玉米地、高粱地', '一条黑狗'],
        day: [[15, 'field', 'fieldWest'], [16.3, 'thresh'], [18.3, 'oxHome'], [18.7, 'dinner'], [19.1, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'straw', top: 'indigo', pants: 'black', legwrap: true, sash: 'black', item: 'hoe',
      },
      {
        id: 'liu_cuihua', name: '刘翠花', nick: '杨二嫂', age: 31, sex: '女', relation: '杨二牛的媳妇',
        job: '持家、喂牲口', skills: ['做饭', '喂牲口', '剥玉米'],
        traits: ['泼辣', '护短'],
        bio: '刘木匠的远房表妹，家中的鸡群和牛的草料都由她照管。谁家孩子欺负了小虎，她能一路追到人家门口。',
        likes: '庙会',
        owns: ['一窝鸡'],
        day: [[15, 'yardWork'], [15.8, 'feedChickens'], [16.4, 'shopping'], [17.0, 'thresh', 'help'], [17.8, 'cook'], [18.7, 'dinner'], [19.1, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', hat: 'scarf', scarfRamp: 'green', top: 'red', style: 'side', pants: 'indigo', item: 'basket', blush: true,
      },
      {
        id: 'yang_xiaohu', name: '杨小虎', nick: '小虎', age: 7, sex: '男', relation: '杨二牛的儿子',
        job: '还没上学', skills: ['放风筝'],
        traits: ['顽皮', '好动'],
        bio: '还未到上学的年纪，整天举着父亲扎的风筝满村奔跑，盼着大宝他们早点放学。',
        likes: '风筝、骑牛',
        owns: ['一只风筝'],
        day: [[15, 'play'], [16.5, 'play'], [18.7, 'dinner'], [19.1, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skinTan', hair: 'tuft', top: 'khaki', pants: 'indigo', item: 'kite', smile: true,
      },
    ],
  },
  {
    id: 'farmC', name: '吴家', kind: '石头房 + 猪圈 + 兔笼',
    note: '村北高处的庄稼人家。东坡的谷子地和白菜地归吴家所有，院里养着猪、鸡和兔子，溪边那群鸭鹅也属吴家。',
    people: [
      {
        id: 'wu_dachuan', name: '吴大川', nick: '吴大哥', age: 38, sex: '男', relation: '户主',
        job: '庄稼汉、挑夫', skills: ['挑担', '收谷子'],
        traits: ['埋头苦干', '实在'],
        bio: '农闲时替孙掌柜挑货进山。这几日在东坡收割谷子，一担接一担地往家里挑。',
        likes: '小米饭、旱烟',
        owns: ['东坡谷子地、白菜地', '两头猪'],
        day: [[15, 'field', 'fieldE'], [16.4, 'haul'], [17.0, 'field', 'fieldE'], [18.3, 'fetchWater'], [18.8, 'dinner'], [19.2, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'khaki', pants: 'indigo', legwrap: true, item: 'pole',
      },
      {
        id: 'sun_qiaoyun', name: '孙巧云', nick: '吴大嫂', age: 35, sex: '女', relation: '吴大川的媳妇',
        job: '持家、养鸭鹅', skills: ['赶鸭', '腌菜', '纳鞋底'],
        traits: ['利落', '会持家'],
        bio: '孙掌柜的堂妹，家中的鸡鸭鹅兔都由她照料。每天傍晚，她都要去溪边把鸭鹅赶回家。',
        likes: '兔子',
        owns: ['一窝鸡', '五只鸭', '四只鹅', '一笼兔子'],
        day: [[15, 'mill'], [16.2, 'feedPigs'], [16.6, 'feedChickens'], [17.0, 'fetchWater'], [17.6, 'cook'], [18.4, 'gatherDucks'], [18.8, 'dinner'], [19.2, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'indigo', style: 'side', pants: 'black', item: 'broom', blush: true,
      },
      {
        id: 'wu_xiaocui', name: '吴小翠', nick: '小翠', age: 10, sex: '女', relation: '吴大川的闺女',
        job: '学童', skills: ['喂兔子'],
        traits: ['懂事', '嘴巧'],
        bio: '吴大川的女儿。每天放学回家，她先给兔子添草，再去溪边帮母亲把鸭子赶回家。',
        likes: '兔子、红头绳',
        owns: [],
        day: [[15, 'school'], [16.5, 'chore', 'feedRabbits'], [17.2, 'play'], [18.4, 'gatherDucks'], [18.8, 'dinner'], [19.2, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'red', style: 'side', pants: 'green', blush: true, smile: true,
      },
    ],
  },
  {
    id: 'square', name: '村口（戏台、大槐树）', kind: '空场 + 戏台 + 剃头小屋',
    note: '全村的"客厅"：白天大槐树下有人对弈乘凉，入夜戏台前人群聚集。剃头匠的小屋就在戏台旁。',
    people: [
      {
        id: 'zheng_laotou', name: '郑守义', nick: '剃头匠老郑', age: 60, sex: '男', relation: '独居',
        job: '剃头匠', skills: ['剃头', '刮脸', '掏耳', '讲古'],
        traits: ['健谈', '消息灵通', '手稳'],
        bio: '在村口摆了二十年剃头摊子。他一边为客人刮脸一边讲古，十里八乡的新鲜事都从这里传开。',
        likes: '讲古、戏曲',
        owns: [],
        day: [[15, 'work'], [18.4, 'dinner'], [18.9, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'shaved', top: 'white', style: 'vest', vest: 'indigo', pants: 'black', item: 'box', mustache: true,
      },
      {
        id: 'qian_xiaoer', name: '钱小二', nick: '货郎', age: 28, sex: '男', relation: '外村人（借住杂货铺）',
        job: '货郎', skills: ['摇拨浪鼓', '以货易货'],
        traits: ['能说会道', '见多识广'],
        bio: '挑着货郎担翻山而来，每半个月来一趟。他走村串户，以针线、头绳和糖块换货；孩子们远远听见拨浪鼓声，便纷纷围拢过来。',
        likes: '与小顺闲谈',
        owns: ['一副货郎担'],
        day: [[15, 'peddle'], [18.6, 'dinner'], [19.0, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'grey', pants: 'black', legwrap: true, item: 'peddler',
      },
      {
        id: 'niu_wanshan', name: '牛万山', nick: '骡帮牛老大', age: 46, sex: '男', relation: '外村人（骡帮，逢集来）', caravan: 'lead',
        job: '骡帮脚夫', skills: ['赶牲口', '驮货', '走山路'],
        traits: ['豪爽', '守信'],
        bio: '从山外的县城赶着三头骡子来，逢五逢十赶集那天一早顺着西沟崖脚、走挂壁古道进村。驮来盐巴、洋布、铁锅、洋火，换走核桃、柿饼、药材和山货，晌午散集就原路回去。',
        likes: '一壶烧酒、和孙掌柜对账',
        owns: ['三头驮骡（大青、二黑、花脸）'],
        day: [[11.6, 'caravanHome']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'khaki', pants: 'black', legwrap: true, item: 'whip', mustache: true,
      },
      {
        id: 'shi_wa', name: '石娃', nick: '小脚夫', age: 18, sex: '男', relation: '外村人（骡帮，逢集来）', caravan: 'helper',
        job: '骡帮伙计', skills: ['喂牲口', '装卸'],
        traits: ['腼腆', '腿脚快'],
        bio: '牛老大的远房外甥，跟着骡帮跑山路学买卖。走在骡子后头，上坡时帮着推一把驮篓。',
        likes: '村口的糖块',
        owns: [],
        day: [[11.6, 'caravanHome']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', legwrap: true, item: 'pole',
      },
    ],
  },
];

// 货郎、骡帮没有自己的院子，晚上借住杂货铺（骡帮平常不在村里，只是名义上的落脚处）
for (const p of HOUSEHOLDS.find((h) => h.id === 'square').people) if (p.id === 'qian_xiaoer' || p.caravan) p.sleepAt = 'store';

/*
 * 上午和中午（到下午三点，接上各人的 day）。
 *   媳妇们天不亮做早饭、喂鸡，然后下地或扫院子，十一点回去做午饭；
 *   中午各家端着碗到门口墙根底下吃（饭场），吃完歇个晌（回屋）；
 *   匠人一早开工，豆腐坊四点多就磨上了豆子、早上端豆腐到村口卖；
 *   孩子七点多上学，中午疯玩；羊倌一早赶羊上坡、中午赶回来；
 *   小六子天一亮挨个去把路口的火把熄了。
 */
const KID = (chore) => [[6.5, ...(chore ? ['chore', chore] : ['play'])], [7.3, 'school'], [11.6, 'play'], [11.9, 'dinner'], [12.5, 'play'], [13.5, 'school']];
const MORNING = {
  wang_deshan: [[6.0, 'sitGate'], [7.0, 'patrol'], [9.5, 'visit', 'school'], [10.5, 'patrol'], [11.9, 'dinner'], [12.6, 'home'], [13.6, 'chess']],
  li_guilan: [[5.4, 'cook'], [6.3, 'worship'], [8.5, 'shopping'], [9.3, 'visit', 'farmA'], [10.8, 'cook'], [11.9, 'dinner'], [12.6, 'home'], [13.5, 'yardWork']],
  wang_xiaomei: KID('yardWork'),
  li_wenqing: [[6.0, 'read'], [7.2, 'teach'], [11.6, 'read'], [12.0, 'dinner'], [12.6, 'home'], [13.4, 'teach']],
  zhang_tiechui: [[5.6, 'fetchWater'], [6.3, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.2, 'work']],
  xiao_shun: [[5.8, 'chore', 'fetchWater'], [6.4, 'work', 'bellows'], [11.8, 'dinner'], [12.5, 'work', 'bellows']],
  zhang_dabao: KID(),
  liu_youfu: [[5.8, 'yardWork'], [6.4, 'work'], [8.8, 'firewood'], [10.6, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.2, 'work']],
  he_xiulan: [[5.3, 'cook'], [6.2, 'fetchWater'], [6.8, 'field', 'fieldW'], [10.9, 'cook'], [11.8, 'dinner'], [12.5, 'home'], [13.3, 'yardWork']],
  liu_erya: KID(),
  zhao_mantun: [[4.6, 'grind'], [6.0, 'boil'], [7.2, 'sellTofu'], [9.5, 'grind'], [11.8, 'dinner'], [12.5, 'home'], [13.3, 'grind']],
  feng_yuzhen: [[4.8, 'work', 'stove'], [6.2, 'feedChickens'], [6.8, 'work', 'stove'], [10.9, 'cook'], [11.8, 'dinner'], [12.5, 'home'], [13.4, 'work', 'stove']],
  zhao_shitou: [[6.5, 'chore', 'work'], [7.3, 'school'], [11.6, 'play'], [11.9, 'dinner'], [12.5, 'chore', 'work'], [13.5, 'school']],
  sun_youcai: [[6.2, 'work'], [11.8, 'dinner'], [12.4, 'work']],
  xiao_liuzi: [[5.6, 'putOutTorches'], [6.6, 'work', 'sweep'], [8.0, 'deliver', 'farmB'], [9.0, 'work', 'sweep'], [11.8, 'dinner'], [12.4, 'work', 'sweep'], [14.0, 'deliver', 'doctor']],
  sun_shuanzi: [[6.6, 'play'], [7.3, 'school'], [11.6, 'read'], [11.9, 'dinner'], [12.5, 'play'], [13.5, 'school']],
  zhou_jishi: [[5.8, 'tendBees'], [6.5, 'work'], [9.0, 'visit', 'headman'], [10.0, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.6, 'work']],
  ma_laoliu: [[5.8, 'herd'], [11.0, 'herdHome'], [11.8, 'dinner'], [12.5, 'home'], [13.3, 'sitGate']],
  chen_mancang: [[5.8, 'garden'], [7.5, 'sitGate'], [9.0, 'chess'], [11.8, 'dinner'], [12.5, 'home'], [13.6, 'garden']],
  chen_daniang: [[5.5, 'cook'], [6.4, 'feedChickens'], [7.0, 'worship'], [9.4, 'sitGate'], [10.8, 'cook'], [11.8, 'dinner'], [12.5, 'home'], [13.5, 'sitGate']],
  yang_erniu: [[5.6, 'yardWork'], [6.2, 'field', 'fieldWest'], [11.4, 'dinner'], [12.2, 'home'], [13.2, 'field', 'fieldW']],
  liu_cuihua: [[5.3, 'cook'], [6.1, 'feedChickens'], [6.7, 'field', 'fieldWest'], [10.9, 'cook'], [11.4, 'dinner'], [12.2, 'home'], [13.4, 'yardWork']],
  yang_xiaohu: [[6.6, 'play'], [11.4, 'dinner'], [12.0, 'play']],
  wu_dachuan: [[5.6, 'feedPigs'], [6.2, 'field', 'fieldE'], [11.6, 'dinner'], [12.3, 'home'], [13.2, 'field', 'fieldE']],
  sun_qiaoyun: [[5.3, 'cook'], [6.2, 'feedChickens'], [6.8, 'feedRabbits'], [7.4, 'field', 'fieldSoy'], [9.4, 'mill'], [10.9, 'cook'], [11.6, 'dinner'], [12.3, 'home'], [13.3, 'yardWork']],
  wu_xiaocui: KID('feedRabbits'),
  zheng_laotou: [[6.0, 'sitGate'], [7.0, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.4, 'work']],
  qian_xiaoer: [[6.5, 'yardWork'], [7.5, 'peddle'], [11.8, 'dinner'], [12.5, 'home'], [13.5, 'peddle']],
  niu_wanshan: [[6.4, 'caravan']], // 骡帮：逢集一早进村，十一点半散集回去（其余日子不来）
  shi_wa: [[6.4, 'caravan']],
};
// 夜里：小六子打更，提着灯绕村一圈
const NIGHT = { xiao_liuzi: [[21.2, 'nightWatch'], [22.8, 'home']] }; // 打更：各家吹灯的时候他还在村里转

for (const h of HOUSEHOLDS) for (const p of h.people) {
  const late = (NIGHT[p.id] ?? []);
  const afternoon = p.day.filter(([t, a]) => !(late.length && a === 'home' && t >= 20)); // 打更的那天晚上晚点回屋
  p.day = [...(MORNING[p.id] ?? []), ...afternoon, ...late];
}

/*
 * 谁和谁要好（同一家的人本来就亲，不用列）：闲聊、看戏挨着站，老人串门找老伙计，孩子找玩伴。
 */
export const FRIENDS = [
  ['wang_deshan', 'chen_mancang'], ['wang_deshan', 'zhou_jishi'], ['zheng_laotou', 'zhou_jishi'], ['chen_mancang', 'zheng_laotou'], ['ma_laoliu', 'zheng_laotou'], ['li_wenqing', 'zhou_jishi'], // 下棋、讲古的老伙计
  ['li_guilan', 'feng_yuzhen'], ['li_guilan', 'chen_daniang'], ['he_xiulan', 'liu_cuihua'], ['sun_qiaoyun', 'liu_cuihua'], ['feng_yuzhen', 'sun_qiaoyun'], // 常串门的媳妇们
  ['zhang_tiechui', 'liu_youfu'], ['yang_erniu', 'wu_dachuan'], ['zhang_tiechui', 'yang_erniu'], // 手艺人、种地的
  ['xiao_shun', 'xiao_liuzi'], ['xiao_liuzi', 'qian_xiaoer'], // 两个小伙子，加上外来的货郎
  ['zhang_dabao', 'zhao_shitou'], ['zhao_shitou', 'sun_shuanzi'], ['zhang_dabao', 'sun_shuanzi'], ['yang_xiaohu', 'zhang_dabao'], // 男孩一伙
  ['wang_xiaomei', 'liu_erya'], ['liu_erya', 'wu_xiaocui'], ['wang_xiaomei', 'wu_xiaocui'], // 女孩一伙
];
export const friendsOf = (id) => FRIENDS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));

export const RESIDENTS = HOUSEHOLDS.flatMap((h) => h.people.map((p) => ({ ...p, home: h.id, household: h.name })));
