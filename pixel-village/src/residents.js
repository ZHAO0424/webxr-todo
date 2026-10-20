/*
 * 石峪村村民名册（虚构，旧时太行山里的一个石头村）。28 人，12 户 + 2 个外来手艺人。
 *
 * 每个人：
 *   身份   name 全名 / nick 村里怎么叫 / age / sex / home 住哪户 / relation 在家里的身份
 *   职业   job 职业 / skills 手艺
 *   性格   traits / bio 来历 / likes 喜欢
 *   家当   owns 养的牲口、种的地
 *   日程   day 一天怎么过：[[开始钟点, 活动, 参数?], …]（活动的含义见 life.js 的 ACTIVITIES）
 *   外观   body / skin / hair / hat / top / style / pants / apron / sash / item / …（见 characters.js）
 *
 * 村里的时间从下午三点走到晚上九点（画面是秋收的黄昏），夜里快进，第二天接着过。
 */

export const VILLAGE = {
  name: '石峪村',
  intro: '太行山深处的一个石头村。房子是山上采的毛石垒的，屋顶压着石板瓦；村前一条小溪，溪上一座石拱桥是唯一的进村路。'
    + '秋收时节，梯田里的玉米、高粱、谷子都黄了，各家房顶晒着玉米，场院里牛拉着碾子轧场。',
};

export const HOUSEHOLDS = [
  {
    id: 'headman', name: '王家（村长家）', kind: '青砖四合院',
    note: '全村最体面的院子：广亮大门、影壁、带前廊的正房、东西厢房。祠堂、水井这些公共的事归王家管。',
    people: [
      {
        id: 'wang_deshan', name: '王德山', nick: '王村长', age: 58, sex: '男', relation: '户主',
        job: '村长兼族长', skills: ['断事', '记账', '下象棋'],
        traits: ['稳重', '好面子', '说话慢条斯理'],
        bio: '祖上三代在村里管事。谁家地界有争执、谁家娶媳妇，都先来找他。每天傍晚揣着旱烟袋去大槐树下跟陈老汉杀两盘。',
        likes: '象棋、旱烟、听梆子戏',
        owns: ['一只狸花猫（花狸）'],
        day: [[15, 'patrol'], [16.5, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'elder', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'brown', style: 'gown', pants: 'black', item: 'pipe', mustache: true,
      },
      {
        id: 'li_guilan', name: '李桂兰', nick: '王婶', age: 54, sex: '女', relation: '王德山的媳妇',
        job: '持家', skills: ['剪窗花', '做面食'],
        traits: ['精明', '热心肠', '嗓门大'],
        bio: '娘家在山外的李家庄。村里谁家办事都请她去掌勺；过年全村的窗花有一半是她剪的。',
        likes: '串门、剪纸',
        owns: [],
        day: [[15, 'yardWork'], [16, 'shopping'], [16.8, 'visit', 'tofu'], [17.6, 'cook'], [18.4, 'dinner'], [19.0, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'indigo', style: 'side', pants: 'black', item: 'basket', blush: true,
      },
      {
        id: 'wang_xiaomei', name: '王小梅', nick: '小梅', age: 9, sex: '女', relation: '王德山的孙女',
        job: '学童', skills: ['背诗'],
        traits: ['文静', '爱干净'],
        bio: '爹娘在县城做事，她跟着爷爷奶奶过。是学堂里字写得最好的。',
        likes: '跳房子、听先生讲故事',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.6, 'chore', 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'pink', style: 'side', pants: 'indigo', blush: true, smile: true,
      },
    ],
  },
  {
    id: 'school', name: '学堂（王家祠堂）', kind: '青砖祠堂',
    note: '王家祠堂的大殿平时当学堂用。李先生住在东厢房。',
    people: [
      {
        id: 'li_wenqing', name: '李文清', nick: '李先生', age: 46, sex: '男', relation: '独居',
        job: '教书先生', skills: ['教书', '写对联', '算盘'],
        traits: ['斯文', '严厉', '心软'],
        bio: '早年在县里念过书，后来被王村长请来教村里的孩子。过年家家户户的对联都是他写的，不收钱，只收两个馍。',
        likes: '写字、喝茶',
        owns: [],
        day: [[15, 'teach'], [16.5, 'read'], [17.4, 'visit', 'doctor'], [18.4, 'dinner'], [19.0, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'indigo', style: 'gown', pants: 'black', item: 'book',
      },
    ],
  },
  {
    id: 'smith', name: '张家铁匠铺', kind: '石头房 + 敞口炉棚',
    note: '村口路边的铁匠铺，全村的镰刀、锄头、马掌都在这儿打。',
    people: [
      {
        id: 'zhang_tiechui', name: '张铁锤', nick: '张铁匠', age: 45, sex: '男', relation: '户主',
        job: '铁匠', skills: ['打农具', '钉马掌', '淬火'],
        traits: ['话少', '力气大', '脾气直'],
        bio: '打铁的手艺是跟他爹学的。秋收前后最忙，全村的镰刀要开刃。媳妇前几年病没了，一个人拉扯儿子大宝。',
        likes: '烧酒、看儿子念书',
        owns: ['一条黄狗（大黄）'],
        day: [[15, 'work'], [17.2, 'fetchWater'], [17.6, 'work'], [18.6, 'dinner'], [19.1, 'evening'], [20.5, 'home']],
        body: 'man', skin: 'skinTan', hair: 'shaved', top: 'grey', style: 'vest', vest: 'black', pants: 'black', apron: 'leather', item: 'hammer', mustache: true,
      },
      {
        id: 'xiao_shun', name: '刘小顺', nick: '小顺', age: 17, sex: '男', relation: '徒弟（寄住）',
        job: '铁匠学徒', skills: ['拉风箱', '抡大锤'],
        traits: ['机灵', '贪玩', '饭量大'],
        bio: '邻村的孤儿，十三岁就来拜师。拉了四年风箱，最近师傅开始让他抡大锤了。',
        likes: '听货郎讲外面的事',
        owns: [],
        day: [[15, 'work', 'bellows'], [17.0, 'peddlerChat'], [17.6, 'work', 'bellows'], [18.6, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', apron: 'leather', item: 'hammer',
      },
      {
        id: 'zhang_dabao', name: '张大宝', nick: '大宝', age: 10, sex: '男', relation: '张铁锤的儿子',
        job: '学童', skills: ['爬树', '打弹弓'],
        traits: ['调皮', '胆大', '护着小的'],
        bio: '学堂里的孩子王。放了学就领着一帮小的满村跑，没少挨先生的戒尺。',
        likes: '爬柿子树、抓蚂蚱',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.8, 'chore', 'fetchWater'], [18.6, 'dinner'], [19.0, 'evening'], [20.1, 'home']],
        body: 'child', skin: 'skinTan', hair: 'tuft', top: 'red', pants: 'indigo', smile: true,
      },
    ],
  },
  {
    id: 'carpenter', name: '刘家木匠铺', kind: '石头房 + 敞口料场',
    note: '院里堆着原木和车轮。村里的大车、犁、桌椅板凳、娶媳妇的箱柜都出自这里。',
    people: [
      {
        id: 'liu_youfu', name: '刘有福', nick: '刘木匠', age: 42, sex: '男', relation: '户主',
        job: '木匠', skills: ['做大车', '修犁', '打家具'],
        traits: ['细致', '爱较真', '乐呵呵'],
        bio: '一手榫卯活远近闻名。这阵子在给杨家修大车轮子，赶着秋收前交活。',
        likes: '琢磨新样式、哼小曲',
        owns: [],
        day: [[15, 'work'], [17.0, 'shopping'], [17.4, 'work'], [18.5, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'khaki', pants: 'black', sash: 'black', item: 'saw',
      },
      {
        id: 'he_xiulan', name: '何秀兰', nick: '刘嫂', age: 39, sex: '女', relation: '刘有福的媳妇',
        job: '持家、种菜', skills: ['纳鞋底', '腌咸菜'],
        traits: ['勤快', '爱操心'],
        bio: '在西坡种着一块白菜地，秋后要腌两大缸酸菜过冬。',
        likes: '跟王婶拉家常',
        owns: ['西坡一块菜地'],
        day: [[15, 'fetchWater'], [15.6, 'field', 'fieldW'], [17.0, 'cook'], [18.5, 'dinner'], [19.0, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', hat: 'scarf', scarfRamp: 'red', top: 'indigo', style: 'side', pants: 'black', item: 'basket',
      },
      {
        id: 'liu_erya', name: '刘二丫', nick: '二丫', age: 9, sex: '女', relation: '刘有福的闺女',
        job: '学童', skills: ['跳绳'],
        traits: ['爱笑', '跟屁虫'],
        bio: '天天跟在大宝后面跑，大宝爬树她就在底下看着。',
        likes: '红头绳、甜枣',
        owns: [],
        day: [[15, 'school'], [16.5, 'play'], [17.8, 'chore', 'feedChickens'], [18.5, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'green', style: 'side', pants: 'black', blush: true,
      },
    ],
  },
  {
    id: 'tofu', name: '赵家豆腐坊', kind: '土坯房 + 驴拉磨',
    note: '每天下午磨豆子、傍晚点豆腐，热气腾腾。豆子是自家南滩地里种的大豆。',
    people: [
      {
        id: 'zhao_mantun', name: '赵满囤', nick: '赵豆腐', age: 40, sex: '男', relation: '户主',
        job: '豆腐匠', skills: ['磨豆', '点卤', '压豆腐'],
        traits: ['和气', '起得早', '爱吆喝'],
        bio: '豆腐手艺祖传。下午赶驴磨豆子，傍晚在灶上煮浆点卤；第二天一早挑着担子去山外的集上卖。',
        likes: '跟驴说话',
        owns: ['一头灰驴（灰灰）', '南滩一块大豆地'],
        day: [[15, 'grind'], [16.8, 'boil'], [18.5, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', apron: 'white', item: 'ladle', smile: true,
      },
      {
        id: 'feng_yuzhen', name: '冯玉珍', nick: '豆腐嫂', age: 36, sex: '女', relation: '赵满囤的媳妇',
        job: '豆腐坊帮手', skills: ['压豆腐', '做豆腐脑'],
        traits: ['爽利', '爱说笑'],
        bio: '村里人都说她做的豆腐脑最嫩。傍晚端一盆豆腐到戏台前，谁家要就切一块。',
        likes: '听戏',
        owns: [],
        day: [[15, 'work', 'stove'], [16.8, 'feedChickens'], [17.3, 'sellTofu'], [18.5, 'dinner'], [19.0, 'evening'], [20.3, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'pink', style: 'side', pants: 'indigo', apron: 'white', item: 'bowl', blush: true, smile: true,
      },
      {
        id: 'zhao_shitou', name: '赵石头', nick: '石头', age: 8, sex: '男', relation: '赵满囤的儿子',
        job: '学童', skills: ['赶驴'],
        traits: ['憨', '老实', '力气大'],
        bio: '先生让背书背不下来，赶驴推磨倒是一把好手。',
        likes: '豆腐脑、骑驴',
        owns: [],
        day: [[15, 'school'], [16.5, 'chore', 'work'], [17.6, 'play'], [18.5, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skinTan', hair: 'shaved', top: 'khaki', pants: 'indigo',
      },
    ],
  },
  {
    id: 'store', name: '孙家杂货铺', kind: '临路青砖铺面',
    note: '油盐酱醋、针头线脑、火柴烟叶都卖。门口挂着两面红幌子。',
    people: [
      {
        id: 'sun_youcai', name: '孙有财', nick: '孙掌柜', age: 50, sex: '男', relation: '户主',
        job: '杂货铺掌柜', skills: ['打算盘', '记账', '进货'],
        traits: ['精打细算', '笑脸迎人'],
        bio: '每月进两趟山外的县城上货。谁家手头紧可以先赊着，年底一并结。',
        likes: '算账、听新闻',
        owns: ['一只橘猫（大橘）'],
        day: [[15, 'work'], [18.6, 'dinner'], [19.3, 'work'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'brown', style: 'gown', pants: 'black', mustache: true,
      },
      {
        id: 'xiao_liuzi', name: '周六子', nick: '小六子', age: 19, sex: '男', relation: '伙计（住铺里）',
        job: '杂货铺伙计', skills: ['搬货', '吆喝'],
        traits: ['嘴甜', '腿快'],
        bio: '周郎中的远房侄子，在铺里学做买卖。扫街、搬货、送货上门都归他；天一擦黑，还得挨个去把路口的火把点上。',
        likes: '看戏台上的热闹',
        owns: [],
        day: [[15, 'work', 'sweep'], [16.2, 'deliver', 'headman'], [16.8, 'work', 'sweep'], [18.1, 'lightTorches'], [19.0, 'dinner'], [19.3, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'short', top: 'indigo', pants: 'black', sash: 'red', item: 'broom', smile: true,
      },
      {
        id: 'sun_shuanzi', name: '孙栓子', nick: '栓子', age: 11, sex: '男', relation: '孙有财的儿子',
        job: '学童', skills: ['打算盘'],
        traits: ['爱看书', '胆小'],
        bio: '他爹指望他将来接铺子，他自己想跟李先生一样教书。',
        likes: '看书、小人书',
        owns: [],
        day: [[15, 'school'], [16.5, 'read'], [17.5, 'play'], [18.6, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'short', top: 'indigo', pants: 'black', item: 'book', smile: true,
      },
    ],
  },
  {
    id: 'doctor', name: '周家药铺', kind: '石头铺面 + 晒药院',
    note: '院里摆着晒药的竹匾，后院还有几箱蜜蜂，蜂蜜是拿来做蜜丸的。',
    people: [
      {
        id: 'zhou_jishi', name: '周济世', nick: '周郎中', age: 70, sex: '男', relation: '独居',
        job: '郎中', skills: ['号脉', '采药', '配蜜丸', '养蜂'],
        traits: ['慈祥', '讲究', '耳背'],
        bio: '在村里行医四十年，村里一半的人是他接生的。每天傍晚背着药箱去陈大娘家看看她的老寒腿。',
        likes: '晒太阳、侍弄蜂箱',
        owns: ['三箱蜜蜂'],
        day: [[15, 'work'], [16.6, 'tendBees'], [17.2, 'visit', 'farmA'], [18.4, 'dinner'], [19.1, 'evening'], [20.2, 'home']],
        body: 'elder', skin: 'skin', hair: 'white', hairRamp: 'grey', hat: 'skullcap', top: 'grey', style: 'gown', pants: 'black', item: 'box', beard: true, elder: true,
      },
    ],
  },
  {
    id: 'shepherd', name: '马家羊圈', kind: '半山腰的石头平房 + 羊圈',
    note: '村西半山腰，离村子最远。羊圈里九只山羊绵羊。',
    people: [
      {
        id: 'ma_laoliu', name: '马老六', nick: '羊倌老马', age: 50, sex: '男', relation: '独居',
        job: '羊倌', skills: ['放羊', '甩鞭', '唱山歌'],
        traits: ['孤僻', '嗓子亮', '心善'],
        bio: '一辈子没娶媳妇，跟羊过。下午赶着羊上坡吃草，太阳落山前一声鞭响就把羊赶回圈。',
        likes: '山歌、黑狗黑子',
        owns: ['九只羊', '一条黑狗（黑子）'],
        day: [[15, 'herd'], [17.0, 'herdHome'], [17.8, 'dinner'], [18.1, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'white', style: 'vest', vest: 'khaki', pants: 'black', legwrap: true, item: 'whip',
      },
    ],
  },
  {
    id: 'farmA', name: '陈家', kind: '石头房 + 猪圈 + 菜园',
    note: '老两口过日子，儿子在山外当学徒。院里两头黑猪、一窝鸡，墙外一小块菜园。',
    people: [
      {
        id: 'chen_mancang', name: '陈满仓', nick: '陈老汉', age: 72, sex: '男', relation: '户主',
        job: '老农（种菜、喂猪）', skills: ['看天', '编筐'],
        traits: ['倔', '爱抬杠', '棋臭'],
        bio: '种了一辈子地，现在腿脚不利索了，就侍弄院外的菜园。跟王村长下了三十年棋，输多赢少，嘴上从不服。',
        likes: '旱烟、象棋、晒太阳',
        owns: ['两头黑猪'],
        day: [[15, 'garden'], [16.2, 'feedPigs'], [16.6, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'elder', skin: 'skinTan', hair: 'white', hairRamp: 'grey', hat: 'felt', top: 'black', pants: 'black', item: 'pipe', beard: true, elder: true,
      },
      {
        id: 'chen_daniang', name: '赵凤英', nick: '陈大娘', age: 70, sex: '女', relation: '陈满仓的老伴',
        job: '持家', skills: ['纺线', '蒸花馍'],
        traits: ['唠叨', '疼孩子'],
        bio: '腿上有老寒病，拄着拐。村里的孩子路过她家门口，总能讨到一块红枣。',
        likes: '晒太阳、看孩子们玩',
        owns: ['一窝鸡'],
        day: [[15, 'sitGate'], [16.4, 'feedChickens'], [17.0, 'sitGate'], [17.6, 'cook'], [18.4, 'dinner'], [19.0, 'home']],
        body: 'woman', skin: 'skinTan', hair: 'bun', hairRamp: 'grey', hat: 'scarf', scarfRamp: 'black', top: 'black', style: 'side', pants: 'black', item: 'cane', elder: true,
      },
    ],
  },
  {
    id: 'farmB', name: '杨家', kind: '土坯房 + 牛棚',
    note: '村东的庄稼户。西坡的玉米地、高粱地是杨家的，院里有牛棚，养着一头老黄牛。',
    people: [
      {
        id: 'yang_erniu', name: '杨二牛', nick: '杨二哥', age: 34, sex: '男', relation: '户主',
        job: '庄稼汉', skills: ['犁地', '赶牛', '轧场'],
        traits: ['憨厚', '能干', '爱面子'],
        bio: '家里排行老二。今年玉米、高粱都丰收，这几天下午赶着老黄牛去场院轧场。',
        likes: '老黄牛、烧酒',
        owns: ['一头黄牛（老黄）', '西坡玉米地、高粱地', '一条黑狗'],
        day: [[15, 'field', 'fieldW'], [16.3, 'thresh'], [18.3, 'oxHome'], [18.7, 'dinner'], [19.1, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'straw', top: 'indigo', pants: 'black', legwrap: true, sash: 'black', item: 'hoe',
      },
      {
        id: 'liu_cuihua', name: '刘翠花', nick: '杨二嫂', age: 31, sex: '女', relation: '杨二牛的媳妇',
        job: '持家、喂牲口', skills: ['做饭', '喂牲口', '剥玉米'],
        traits: ['泼辣', '护短'],
        bio: '刘木匠的远房表妹。家里的鸡、牛草料都归她管，谁家孩子欺负她家小虎，她能追到人家门口。',
        likes: '赶庙会',
        owns: ['一窝鸡'],
        day: [[15, 'yardWork'], [15.8, 'feedChickens'], [16.4, 'shopping'], [17.0, 'thresh', 'help'], [17.8, 'cook'], [18.7, 'dinner'], [19.1, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', hat: 'scarf', scarfRamp: 'green', top: 'red', style: 'side', pants: 'indigo', item: 'basket', blush: true,
      },
      {
        id: 'yang_xiaohu', name: '杨小虎', nick: '小虎', age: 7, sex: '男', relation: '杨二牛的儿子',
        job: '还没上学', skills: ['放风筝'],
        traits: ['淘', '一刻闲不住'],
        bio: '还不到上学的年纪，整天举着他爹给扎的风筝满村跑，等大宝他们放学。',
        likes: '风筝、骑牛',
        owns: ['一只风筝'],
        day: [[15, 'play'], [16.5, 'play'], [18.7, 'dinner'], [19.1, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skinTan', hair: 'tuft', top: 'khaki', pants: 'indigo', item: 'kite', smile: true,
      },
    ],
  },
  {
    id: 'farmC', name: '吴家', kind: '石头房 + 猪圈 + 兔笼',
    note: '村北高处的庄稼户。东坡的谷子地、白菜地是吴家的。院里有猪、鸡、兔子，溪边那群鸭鹅也是吴家的。',
    people: [
      {
        id: 'wu_dachuan', name: '吴大川', nick: '吴大哥', age: 38, sex: '男', relation: '户主',
        job: '庄稼汉、挑夫', skills: ['挑担', '收谷子'],
        traits: ['闷头干活', '实在'],
        bio: '农闲时给孙掌柜挑货进山。这几天在东坡收谷子，一担一担往家挑。',
        likes: '小米饭、抽一袋烟',
        owns: ['东坡谷子地、白菜地', '两头猪'],
        day: [[15, 'field', 'fieldE'], [16.4, 'haul'], [17.0, 'field', 'fieldE'], [18.3, 'fetchWater'], [18.8, 'dinner'], [19.2, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'khaki', pants: 'indigo', legwrap: true, item: 'pole',
      },
      {
        id: 'sun_qiaoyun', name: '孙巧云', nick: '吴大嫂', age: 35, sex: '女', relation: '吴大川的媳妇',
        job: '持家、养鸭鹅', skills: ['赶鸭子', '腌菜', '纳鞋底'],
        traits: ['利落', '会过日子'],
        bio: '孙掌柜的堂妹。每天傍晚去溪边把鸭鹅赶回家。',
        likes: '养兔子',
        owns: ['一窝鸡', '五只鸭', '四只鹅', '一笼兔子'],
        day: [[15, 'yardWork'], [15.8, 'feedPigs'], [16.4, 'feedChickens'], [17.0, 'fetchWater'], [17.6, 'cook'], [18.4, 'gatherDucks'], [18.8, 'dinner'], [19.2, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', top: 'indigo', style: 'side', pants: 'black', item: 'broom', blush: true,
      },
      {
        id: 'wu_xiaocui', name: '吴小翠', nick: '小翠', age: 10, sex: '女', relation: '吴大川的闺女',
        job: '学童', skills: ['喂兔子'],
        traits: ['懂事', '嘴巧'],
        bio: '放学回家先喂兔子，再去溪边帮娘赶鸭子。',
        likes: '兔子、红头绳',
        owns: [],
        day: [[15, 'school'], [16.5, 'chore', 'feedRabbits'], [17.2, 'play'], [18.4, 'gatherDucks'], [18.8, 'dinner'], [19.2, 'evening'], [20.0, 'home']],
        body: 'child', skin: 'skin', hair: 'braids', top: 'red', style: 'side', pants: 'green', blush: true, smile: true,
      },
    ],
  },
  {
    id: 'square', name: '村口（戏台、大槐树）', kind: '空场 + 戏台 + 剃头小屋',
    note: '全村的"客厅"：大槐树下下棋、乘凉，戏台前晚上聚人。剃头匠的小屋在戏台旁边。',
    people: [
      {
        id: 'zheng_laotou', name: '郑守义', nick: '剃头匠老郑', age: 60, sex: '男', relation: '独居',
        job: '剃头匠', skills: ['剃头', '刮脸', '掏耳朵', '讲古'],
        traits: ['嘴碎', '消息灵通', '手稳'],
        bio: '在村口摆了二十年剃头挑子。一边给人刮脸一边讲古，十里八乡的新鲜事都从他这儿传开。',
        likes: '讲古、听戏',
        owns: [],
        day: [[15, 'work'], [18.4, 'dinner'], [18.9, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skin', hair: 'shaved', top: 'white', style: 'vest', vest: 'indigo', pants: 'black', item: 'box', mustache: true,
      },
      {
        id: 'qian_xiaoer', name: '钱小二', nick: '货郎', age: 28, sex: '男', relation: '外村人（借住杂货铺）',
        job: '货郎', skills: ['摇拨浪鼓', '换针线糖块'],
        traits: ['能说会道', '走南闯北'],
        bio: '挑着货郎担子翻山过来，半个月来一趟。走村串户换针线、头绳、糖块，孩子们老远听见拨浪鼓就围上来。',
        likes: '跟小顺吹牛',
        owns: ['一副货郎担'],
        day: [[15, 'peddle'], [18.6, 'dinner'], [19.0, 'evening'], [20.6, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'grey', pants: 'black', legwrap: true, item: 'pole',
      },
    ],
  },
];

// 货郎没有自己的院子，晚上借住杂货铺
for (const p of HOUSEHOLDS.find((h) => h.id === 'square').people) if (p.id === 'qian_xiaoer') p.sleepAt = 'store';

export const RESIDENTS = HOUSEHOLDS.flatMap((h) => h.people.map((p) => ({ ...p, home: h.id, household: h.name })));
