/*
 * 石峪村村民名册（虚构，旧时太行山里的一个石头村）。28 人，12 户 + 2 个外来手艺人；老村址（east.js）另有 4 户 5 人。
 *
 * 每个人：
 *   身份   name 全名 / nick 村里怎么叫 / age / sex / home 住哪户 / relation 在家里的身份
 *   职业   job 职业 / skills 手艺
 *   性格   traits / bio 来历（一两句，卡片用）/ story 背景故事（长一些，档案的详细信息卡用）/ likes 喜欢
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
        story: '王家在石峪村住了七代，祖上出过两任里正。德山年轻时跟着骡帮走过三年山路，见过县城的衙门和洋学堂，回村后接下了父亲的担子。那年山洪冲垮了村口的石桥，是他挨家挨户凑钱凑工，领着全村后生重新砌起来，桥头的石碑上至今刻着各家的名字。他说话从不抬高嗓门，吵得再凶的两家人，只要他往中间一坐，火气就消了一半。唯一的心事是儿子儿媳在县城做事，一年只回来一趟。',
        likes: '象棋、旱烟、梆子戏',
        owns: ['一只狸花猫（花狸）'],
        day: [[15, 'patrol'], [16.5, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'elder', skin: 'skin', hair: 'short', hat: 'skullcap', top: 'brown', style: 'gown', pants: 'black', item: 'pipe', mustache: true,
      },
      {
        id: 'li_guilan', name: '李桂兰', nick: '王婶', age: 54, sex: '女', relation: '王德山的媳妇',
        job: '种田', skills: ['剪窗花', '面食'],
        traits: ['精明', '热心', '嗓门洪亮'],
        bio: '娘家在山外的李家庄。村里谁家操办酒席，都请她来主厨；每逢过年，全村半数的窗花出自她手。',
        story: '十九岁那年坐着花轿翻过两道梁嫁进王家，进门第二天就下灶给全家擀了一锅长面，从此在村里出了名。她嘴快心热，谁家媳妇坐月子、谁家老人病了，她总是头一个提着鸡蛋上门。一把剪刀在她手里能剪出喜鹊登梅、五谷丰登，腊月里来求窗花的孩子能在门口排成一串。王村长在外头说一不二，回到家里，柴米油盐的事都得听她的。',
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
        story: '小梅三岁那年，爹娘去县城的布庄做事，把她留在爷爷奶奶身边。她最盼过年，爹娘会带回一包洋糖和一本新画书。她喜欢跟着李先生认字，学堂里的诗数她背得最多，可一被叫起来站在大家面前，脸就红到耳根。爹娘寄来的每一封信，她都压在枕头底下，睡前还要偷偷再看一遍。',
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
        story: '李先生是山外李家庄人，和王婶算是同乡。年轻时在县城读过几年新学，本想去省城谋个差事，后来家道中落，只好回乡。王村长三次登门，许他祠堂里一间屋、每年两石小米，请他来教村里的娃娃，他这一教就是十几年。他对学生严厉，戒尺落下去却总是轻轻的；谁家交不起学费，他就让孩子帮着扫院子抵了。',
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
        story: '张家打铁打了四代，铺子里那口老砧子还是他爷爷从山外背回来的。铁锤年轻时力气大、脾气也大，跟人顶两句就要动手，娶了大宝娘以后才慢慢收了性子。那年冬天大宝娘一场风寒没熬过去，他三天没开炉，第四天天不亮，铺子里又响起了叮当声。如今他话更少了，只有听见大宝在屋里念书，才会停下锤子，咧嘴笑一笑。',
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
        story: '小顺本是邻村刘家沟的孩子，八岁上爹娘先后病故，吃百家饭长大。十三岁那年张铁匠去刘家沟收旧铁，见他蹲在路边看人修犁看了一下午，便问他愿不愿意学打铁。头三年他只管拉风箱、劈柴、挑水，夜里就睡在炉棚边上。他最爱听货郎讲山外的事，说等出了师，要去县城开一间自己的铁匠铺。',
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
        story: '大宝是村里有名的孩子王，爬树、掏鸟窝、打弹弓样样在行，先生的戒尺没少落在他手心上。娘走那年他才六岁，从那以后便学会了自己烧水、自己补衣裳。他嘴上从不说想娘，可每年清明，都会偷偷去山坡上采一把野花。小一点的孩子受了欺负都来找他，他拍着胸脯说：“有我在，谁也别想欺负你们。”',
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
        story: '刘木匠的手艺是在山外跟一位老师傅学的，整整学了七年。他做活最较真，一根榫头差了半分都要拆了重来，村里人笑他“刘一刨”。谁家盖房、娶亲、打家具，都离不开他。他爱琢磨新式样，去年给孙掌柜打的那架带抽屉的柜台，连县城来的客商都夸。干活时他总哼着小曲，一天下来，刨花能堆到膝盖。',
        likes: '新式样、小曲',
        owns: [],
        day: [[15, 'work'], [17.0, 'shopping'], [17.4, 'work'], [18.5, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'felt', top: 'khaki', pants: 'black', sash: 'black', item: 'saw',
      },
      {
        id: 'he_xiulan', name: '何秀兰', nick: '刘嫂', age: 39, sex: '女', relation: '刘有福的媳妇',
        job: '种田、种菜', skills: ['纳鞋底', '腌咸菜'],
        traits: ['勤快', '爱操心'],
        bio: '刘木匠的妻子，在西坡种着一块白菜地。每年秋后，她都要腌上两大缸酸菜，供全家过冬。',
        story: '刘嫂是本村何家的闺女，和刘木匠打小就认识。她手脚闲不住，天不亮就起来挑水，白天在西坡的菜地里锄草浇水，晚上就着油灯纳鞋底，一家三口的鞋全出自她手。她腌的酸菜酸得正好，入冬后常有邻居端着碗来讨。她最爱操心，丈夫出门忘了带干粮，她能追出半里地去送。',
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
        story: '二丫是刘家的独女，生下来就爱笑，见了谁都甜甜地叫一声。她最喜欢跟在大宝哥后面跑，大宝爬树她就在树下仰着头等，掏了鸟蛋总会分她一颗。她的红头绳是娘赶集时给买的，宝贝得很，下雨天都舍不得扎。她的心愿是长大了也能像王婶那样，剪出满窗好看的窗花。',
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
        story: '赵家的豆腐坊在村里开了快一百年，点卤的方子只传长子。满囤十五岁接手，二十多年来几乎没睡过一个懒觉：后半夜磨豆、煮浆、点卤，天一亮挑着担子翻山去赶集。他和那头灰驴说话比和人说话还多，常说“灰灰比我还懂豆腐”。村里谁家办喜事，他都要送上两板豆腐，从不收钱。',
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
        story: '豆腐嫂娘家在山外的冯家集，嫁过来那年才十八岁。她嗓门亮、爱说笑，豆腐坊里有她在就不冷清。她做的豆腐脑嫩得能颤，浇上一勺卤汁，是村里孩子们最馋的吃食。她最爱看戏，每逢村口唱戏，总要早早端着豆腐挤到前排，一边卖一边跟着哼。',
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
        story: '石头生得结实，八岁就能帮爹扛半袋黄豆。他念书不灵，一篇《三字经》背了半年还磕磕绊绊，先生急得直叹气。可一进磨坊他就成了行家，什么时候该给驴换方向、豆子该磨几遍，他比谁都清楚。他心里早就认定，将来要接下爹的豆腐坊，做全村最好吃的豆腐。',
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
        story: '孙家原是山外的小商贩，到孙有财爷爷那辈才在石峪村落了脚。杂货铺里油盐酱醋、针头线脑一应俱全，还能托他从县城捎带药材和布匹。他算盘打得飞快，账却记得宽厚，年景不好时，有的人家一赊就是一整年。他每次进城都要带回几张旧报纸，晚上铺子里总围着一圈人听他讲山外的新鲜事。',
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
        story: '小六子是周郎中的远房侄子，家在三十里外的周家峪，十五岁被送来学做买卖。他嘴甜腿勤，见谁都笑着打招呼，村里的婶子大娘都喜欢他。每天天不亮他就起来扫铺子门前的街，傍晚再挨个把路口的火把点亮。他最盼着村口唱戏，戏台搭起来的那几天，干活都格外有劲。',
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
        story: '栓子是孙掌柜的独子，打小就被爹按在算盘前练拨珠子。可他心思全在书本上，一本小人书能翻来覆去看几十遍。他胆子小，天黑了不敢一个人走夜路，却敢在先生面前一口气背出整篇古文。他偷偷跟李先生说，长大了想去县城念书，以后也回村里教书。',
        likes: '书本、小人书',
        owns: [],
        day: [[15, 'school'], [16.5, 'read'], [17.5, 'fish'], [18.6, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
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
        story: '周郎中年轻时在山外的药铺当学徒，二十多岁回到村里，一住就是四十年。村里大半的人是他接生的，谁家孩子发烧、老人腰疼，半夜敲门他也从不推辞。他每年春秋两次上山采药，药铺后院晒满了草药，空气里总飘着一股苦香。他耳朵背了，说话得凑近了喊，可号起脉来，手指一搭便知轻重。',
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
        story: '马老六十二岁起就跟着爹放羊，一辈子没离开过这片山。他一个人住在半山腰的石头房里，平日话很少，只有到了山坡上才放开嗓子唱山歌，歌声能传到对面的山梁。村里人都说他孤僻，可谁家的羊病了、丢了，他总是头一个帮着找。黑狗黑子跟了他八年，是他最贴心的伴儿。',
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
        job: '老农（种菜、喂猪）', skills: ['看天象', '编筐', '钓鱼'],
        traits: ['倔强', '爱抬杠', '棋艺平平'],
        bio: '种了一辈子地，如今腿脚不便，只打理院外的菜园。与王村长对弈三十年，输多赢少，嘴上却从不认输。',
        story: '陈老汉种了一辈子地，年轻时一个人能犁完东坡三亩地。如今腿脚不灵便了，只守着院外那块菜园和两头猪。他看天看得准，说明天下雨，第二天准下，村里人收庄稼前都要来问问他。他和王村长下了三十年棋，输多赢少，每回输了都要嘟囔一句“明天再来”。上午得空，他就扛着竹竿去西沟的水潭钓鱼。',
        likes: '旱烟、象棋、晒太阳，上午走去西沟瀑布下的水潭钓鱼',
        owns: ['两头黑猪'],
        day: [[15, 'garden'], [16.2, 'feedPigs'], [16.6, 'chess'], [18.4, 'dinner'], [19.0, 'evening'], [20.0, 'home']],
        body: 'elder', skin: 'skinTan', hair: 'white', hairRamp: 'grey', hat: 'felt', top: 'black', pants: 'black', item: 'pipe', beard: true, elder: true,
      },
      {
        id: 'chen_daniang', name: '赵凤英', nick: '陈大娘', age: 70, sex: '女', relation: '陈满仓的老伴',
        job: '种田', skills: ['纺线', '蒸花馍'],
        traits: ['唠叨', '疼爱孩子'],
        bio: '腿脚患有老寒病，出门须拄拐杖。村里的孩子路过她家门口，总能讨到一颗红枣。',
        story: '陈大娘年轻时是村里纺线最快的巧手，一架纺车能纺到半夜。后来落下老寒腿，出门得拄着拐杖，可家里的活计一样也没撂下。几个儿女都在外地安了家，院子里冷清，她最爱孩子们来串门，衣兜里总揣着红枣和炒花生。周郎中每天傍晚来给她看腿，她总要留他喝碗小米粥再走。',
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
        story: '杨二牛在家排行老二，大哥早年去了口外做活，家里的地就落在他肩上。那头老黄牛跟了他十二年，犁地、拉车、轧场都靠它。今年雨水好，玉米、高粱都比往年多收了两成，他正请刘木匠修大车，打算秋后拉粮去集上卖个好价钱。他好面子，家里来了客，再紧巴也要摆上一壶烧酒。',
        likes: '老黄牛、烧酒',
        owns: ['一头黄牛（老黄）', '西坡玉米地、高粱地', '一条黑狗'],
        day: [[15, 'field', 'fieldWest'], [16.3, 'thresh'], [18.3, 'oxHome'], [18.7, 'dinner'], [19.1, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'straw', top: 'indigo', pants: 'black', legwrap: true, sash: 'black', item: 'hoe',
      },
      {
        id: 'liu_cuihua', name: '刘翠花', nick: '杨二嫂', age: 31, sex: '女', relation: '杨二牛的媳妇',
        job: '种田、喂牲口', skills: ['做饭', '喂牲口', '剥玉米'],
        traits: ['泼辣', '护短'],
        bio: '刘木匠的远房表妹，家中的鸡群和牛的草料都由她照管。谁家孩子欺负了小虎，她能一路追到人家门口。',
        story: '翠花是刘木匠的远房表妹，从山那边的刘家坪嫁过来。她手脚麻利，喂鸡喂牛、做饭剥玉米，一天忙到黑也不喊累。她性子泼辣，护起儿子来谁也拦不住，有一回小虎被大孩子推倒，她一路追到人家门口讨说法。她最盼着赶庙会，每年都要扯一块花布，给小虎做一身新衣裳。',
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
        story: '小虎还没到上学的年纪，每天最盼的就是学堂放学的那声钟响。爹给他扎了一只燕子风筝，他走到哪儿举到哪儿，连吃饭都舍不得放下。他最崇拜大宝哥，总想跟着去爬树掏鸟窝，可每回都被娘一把拎回家。他最大的愿望，是有一天能骑上老黄牛，在村里绕上一圈。',
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
        story: '吴大川话不多，干起活来却顶两个人。农闲时他替孙掌柜挑货进山，一副扁担一百多斤，翻两道梁不歇脚。东坡的谷子地是他一镢头一镢头开出来的荒，如今每年能收好几石小米。他最爱一碗热乎乎的小米饭，配上媳妇腌的咸菜，再抽一袋旱烟，就是最舒坦的日子。',
        likes: '小米饭、旱烟',
        owns: ['东坡谷子地、白菜地', '两头猪'],
        day: [[15, 'field', 'fieldE'], [16.4, 'haul'], [17.0, 'field', 'fieldE'], [18.3, 'fetchWater'], [18.8, 'dinner'], [19.2, 'evening'], [20.4, 'home']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'khaki', pants: 'indigo', legwrap: true, item: 'pole',
      },
      {
        id: 'sun_qiaoyun', name: '孙巧云', nick: '吴大嫂', age: 35, sex: '女', relation: '吴大川的媳妇',
        job: '种田、养鸭鹅', skills: ['赶鸭', '腌菜', '纳鞋底'],
        traits: ['利落', '会持家'],
        bio: '孙掌柜的堂妹，家中的鸡鸭鹅兔都由她照料。每天傍晚，她都要去溪边把鸭鹅赶回家。',
        story: '巧云是孙掌柜的堂妹，嫁到吴家后，把一个穷家操持得井井有条。院子里的鸡鸭鹅兔都是她一手养大的，每一只她都叫得出名字。她算账精明，家里每一个铜板都花在刀刃上，几年下来攒钱添了一笼兔子和两头猪。每天傍晚，她都要去溪边吆喝着把鸭鹅赶回家，那吆喝声全村都听得见。',
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
        story: '小翠是吴家的大闺女，十岁就已经是娘的好帮手。每天放学回家，她先给兔子添一把青草，再提着竹竿去溪边帮娘赶鸭子。她嘴巧，学堂里谁闹了别扭，她三言两语就能劝和。她给每一只兔子都起了名字，最小的那只白兔叫“雪团”。',
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
        story: '老郑年轻时跟着戏班子走南闯北，后来嗓子倒了，就学了剃头的手艺。二十年前他在村口大槐树下支起剃头摊子，从此再没挪过窝。他一边给人刮脸，一边讲古论今，从三国讲到水浒，十里八乡的新鲜事都从他这儿传开。他手稳，剃刀贴着头皮走一圈，连一道血口子都不会留。',
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
        story: '钱小二是山外钱家庄人，十六岁就挑起了货郎担。太行山里大大小小几十个村子他都走过，哪个村的媳妇爱买花线、哪个村的孩子馋麦芽糖，他心里都有数。他每半个月来一趟石峪村，借住在孙掌柜的杂货铺里。他见多识广，讲起山外的新鲜事来，连老郑都要竖起耳朵听。',
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
        story: '牛万山赶骡帮赶了二十多年，太行山里的挂壁古道、险崖窄路，他闭着眼都能走。他为人豪爽、最讲信用，说好逢五逢十来，刮风下雨从不误期。驮来的盐巴、洋布、铁锅，换走的核桃、柿饼、药材，账目从来分毫不差。每回散集前，他都要和孙掌柜坐下来喝一壶烧酒，对完账才上路。',
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
        story: '石娃是牛老大的远房外甥，家在山那边的石家沟，十六岁跟着骡帮出来学买卖。他腼腆少语，见了生人就脸红，可腿脚极快，上坡时总是头一个冲上去帮骡子推驮篓。他最喜欢村口杂货铺里的糖块，每回来都要买上两块，一块自己吃，一块留给家里的小妹。',
        likes: '村口的糖块',
        owns: [],
        day: [[11.6, 'caravanHome']],
        body: 'man', skin: 'skinTan', hair: 'short', hat: 'towel', top: 'indigo', pants: 'black', legwrap: true, item: 'pole',
      },
    ],
  },
];

// 老村址（east.js）：大水以后不肯搬走、或者后来才落脚的几户，都住在黄土坎上
HOUSEHOLDS.push(
  {
    id: 'riverTemple', name: '河神庙（柳家）', kind: '坎上的小砖庙 + 土坯小屋', oldSite: true,
    note: '黄土坎沿上的河神庙，庙旁一间土坯小屋。柳婆婆守了一辈子庙，水生是她从河滩上捡回来养大的。',
    people: [
      {
        id: 'liu_popo', name: '柳桂芝', nick: '柳婆婆', age: 82, sex: '女', relation: '户主',
        job: '守庙、看水', skills: ['看天看水', '接骨', '讲老石峪的事'],
        traits: ['倔', '念旧', '心细'],
        bio: '大水那年男人没了，全村搬走她不走，守着河神庙过了六十年。每天早晚给河神上一炷香，再去水则碑前看一回水。',
        story: '柳桂芝十八岁嫁到老石峪，二十二岁那年夏天发了大水。她男人为了把邻居家的孩子从房顶上背下来，再没上岸。水退了，大半人家搬去了下游，她不走，说男人还在这条河里。她在坎上搭了间小屋，守着后来修起的河神庙，一守就是六十年。老石峪哪家住在哪儿、谁家门口有棵什么树，她都记得清清楚楚。新来的人想在这儿落脚，头一个要见的就是她。',
        likes: '歪脖子老柳、晒太阳、有人来听她讲古',
        owns: ['河神庙的钥匙'],
        day: [[15, 'watchWater'], [16.4, 'sitGate'], [17.4, 'cook'], [18.4, 'dinner'], [19.0, 'riverIncense'], [19.5, 'home']],
        body: 'elder', skin: 'skin', hair: 'bun', hairRamp: 'white', top: 'black', style: 'side', pants: 'black', item: 'cane', elder: true,
      },
      {
        id: 'liu_shuisheng', name: '柳水生', nick: '水生', age: 19, sex: '男', relation: '柳婆婆养大的孙子',
        job: '捞漂木、撑筏子', skills: ['水性好', '撑筏', '劈柴', '捉鱼'],
        traits: ['话少', '胆大', '孝顺'],
        bio: '襁褓里顺着河漂下来，被柳婆婆从河滩上捡回去养大。如今天天在河滩上捞上游冲下来的漂木，晒干劈了当柴卖。',
        story: '十九年前一个发水的早上，柳婆婆在河滩的柳树根底下捡到一只木盆，盆里是个哭哑了嗓子的娃娃。她给他起名叫水生。水生是在河边长大的，水性比鱼还好，撑一根竹篙能在河心洲两边来回。他话少，力气大，每天捞漂木、劈柴，攒下的钱都交给婆婆。村里的姑娘们说他长得俊，就是太闷。',
        likes: '河心洲、婆婆做的玉米面糊糊',
        owns: ['一根竹篙', '一只木筏'],
        day: [[15, 'driftwood'], [17.4, 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.6, 'home']],
        body: 'man', build: 'thin', skin: 'skinTan', hair: 'crew', hat: 'douli', top: 'khaki', style: 'vest', pants: 'brown', item: 'pole', legwrap: true,
      },
    ],
  },
  {
    id: 'mason', name: '葛家石匠院', kind: '坎上的夯土房 + 露天石料场', oldSite: true,
    note: '院里码着一垛垛凿方的条石，地上滚着打了一半的磨盘。叮叮当当的錾子声从早响到晚。',
    people: [
      {
        id: 'ge_shitou', name: '葛长庚', nick: '葛石头', age: 40, sex: '男', relation: '独居',
        job: '石匠', skills: ['錾磨', '砌石', '采石', '刻碑'],
        traits: ['闷葫芦', '力气大', '实在'],
        bio: '从山外来接修堤的活，一干就留了下来。全村的磨盘磨平了都找他来錾，水则碑上的字也是他刻的。',
        story: '葛长庚是河北那边的石匠，三十岁那年跟着师傅来老石峪修河堤。堤修完了，师傅回去了，他留了下来——他说这片河滩上的石头好，青石细，錾出来的磨盘不掉渣。他一个人住在坎上，整天叮叮当当地凿石头，三棍子打不出一个闷屁。可谁家砌墙基、盘炕、修猪圈，喊一声他就来，给多少是多少。',
        likes: '好石头、一碗烧酒',
        owns: ['一套錾子', '一车条石'],
        day: [[15, 'work'], [17.6, 'yardWork'], [18.4, 'dinner'], [19.0, 'evening'], [20.4, 'home']],
        body: 'man', build: 'stout', skin: 'skinTan', hair: 'shaved', top: 'grey', style: 'vest', pants: 'black', item: 'hammer', beard: true,
      },
    ],
  },
  {
    id: 'limeKiln', name: '白家石灰窑', kind: '坎上的平顶小屋 + 毛石圆窑', oldSite: true,
    note: '东头山脚下的一座石灰窑，烧窑的时候窑顶冒白烟。屋前一堆青石、一堆烧好的白灰。',
    people: [
      {
        id: 'bai_laohui', name: '白守成', nick: '白老灰', age: 56, sex: '男', relation: '独居',
        job: '烧石灰', skills: ['烧窑', '看火', '采青石'],
        traits: ['嘴碎', '好酒', '爱干净却总是一身白'],
        bio: '一年到头身上沾着白灰，大家都叫他白老灰。修房子、抹墙、勾缝、刷屋子，用的灰都是他窑里出来的。',
        story: '白守成的爹就烧石灰，窑原先在老石峪东头，大水冲塌了一回，爷儿俩又一块石头一块石头垒了起来。爹死后他一个人守着窑，青石从东山上采，柴火从水生那儿买。他嘴碎，逢人就念叨"修房子，三分砖瓦七分灰"。他天天盼着老村址的破房子有人来修——那可都是他的主顾。',
        likes: '一壶烧酒、跟人念叨',
        owns: ['一座石灰窑'],
        day: [[15, 'work'], [17.5, 'sitGate'], [18.4, 'dinner'], [19.0, 'evening'], [20.2, 'home']],
        body: 'man', skin: 'skin', hair: 'short', hairRamp: 'grey', hat: 'towel', top: 'white', pants: 'grey', item: 'hammer', mustache: true,
      },
    ],
  },
  {
    id: 'duckYard', name: '苗家鸭棚', kind: '河滩上的土坯小屋 + 鸭棚', oldSite: true,
    note: '离水最近的一户，一圈苇子栅栏围着鸭棚。天一亮鸭子就嘎嘎叫着下河。',
    people: [
      {
        id: 'miao_fengxian', name: '苗凤仙', nick: '凤仙嫂', age: 33, sex: '女', relation: '户主（男人在山外扛活）',
        job: '养鸭、卖鸭蛋', skills: ['养鸭', '腌咸鸭蛋', '唱小调'],
        traits: ['爽利', '爱笑', '嘴上不饶人'],
        bio: '男人常年在山外扛活，她一个人在河滩上养了一群鸭子。鸭蛋挎到村里去卖，腌的咸鸭蛋流油。',
        story: '苗凤仙是嫁过来的，婆家原先也住老石峪，大水以后搬走了，只留下河滩边上这块地。她男人在山外的煤窑上扛活，一年回来两趟。她嫌村里规矩多，干脆搬到河滩上来养鸭子，自己当家。她嗓门大，爱笑，一边赶鸭子一边唱小调，坎上的柳婆婆总说："凤仙一唱，这河湾就活了。"',
        likes: '唱小调、跟水生斗嘴',
        owns: ['十几只鸭子', '一口腌蛋的大缸'],
        day: [[15, 'tendDucks'], [17.0, 'cook'], [18.2, 'dinner'], [18.8, 'evening'], [20.2, 'home']],
        body: 'woman', skin: 'skin', hair: 'bun', hat: 'scarf', scarfRamp: 'pink', top: 'red', style: 'side', apron: 'indigo', pants: 'indigo', item: 'basket', blush: true, smile: true,
      },
    ],
  },
);

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
  chen_mancang: [[5.8, 'garden'], [7.5, 'sitGate'], [8.6, 'fish', 'pool'], [11.8, 'dinner'], [12.5, 'home'], [13.6, 'garden']],
  chen_daniang: [[5.5, 'cook'], [6.4, 'feedChickens'], [7.0, 'worship'], [9.4, 'sitGate'], [10.8, 'cook'], [11.8, 'dinner'], [12.5, 'home'], [13.5, 'sitGate']],
  yang_erniu: [[5.6, 'yardWork'], [6.2, 'field', 'fieldWest'], [11.4, 'dinner'], [12.2, 'home'], [13.2, 'field', 'fieldW']],
  liu_cuihua: [[5.3, 'cook'], [6.1, 'feedChickens'], [6.7, 'field', 'fieldWest'], [10.9, 'cook'], [11.4, 'dinner'], [12.2, 'home'], [13.4, 'yardWork']],
  yang_xiaohu: [[6.6, 'play'], [11.4, 'dinner'], [12.0, 'play']],
  wu_dachuan: [[5.6, 'feedPigs'], [6.2, 'field', 'fieldE'], [11.6, 'dinner'], [12.3, 'home'], [13.2, 'field', 'fieldE']],
  sun_qiaoyun: [[5.3, 'cook'], [6.2, 'feedChickens'], [6.8, 'feedRabbits'], [7.4, 'field', 'fieldSoy'], [9.4, 'mill'], [10.9, 'cook'], [11.6, 'dinner'], [12.3, 'home'], [13.3, 'yardWork']],
  wu_xiaocui: KID('feedRabbits'),
  zheng_laotou: [[6.0, 'sitGate'], [7.0, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.4, 'work']],
  qian_xiaoer: [[6.5, 'yardWork'], [7.5, 'peddle'], [11.8, 'dinner'], [12.5, 'home'], [13.5, 'peddle']],
  // 老村址：柳婆婆一早上香、看水；水生下河滩捞漂木；葛石头、白老灰开工；凤仙嫂天不亮放鸭子下河
  liu_popo: [[5.6, 'riverIncense'], [6.3, 'cook'], [7.2, 'watchWater'], [9.4, 'sitGate'], [10.8, 'cook'], [11.8, 'dinner'], [12.5, 'home'], [13.8, 'watchWater']],
  liu_shuisheng: [[5.8, 'yardWork'], [6.5, 'driftwood'], [11.6, 'dinner'], [12.3, 'home'], [13.2, 'driftwood']],
  ge_shitou: [[5.8, 'yardWork'], [6.4, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.3, 'work']],
  bai_laohui: [[5.6, 'work'], [11.8, 'dinner'], [12.5, 'home'], [13.4, 'work']],
  miao_fengxian: [[5.4, 'cook'], [6.2, 'tendDucks'], [10.8, 'cook'], [11.6, 'dinner'], [12.3, 'home'], [13.3, 'tendDucks']],
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
  ['liu_popo', 'chen_daniang'], ['liu_popo', 'zheng_laotou'], ['ge_shitou', 'bai_laohui'], ['ge_shitou', 'zhang_tiechui'], ['miao_fengxian', 'liu_shuisheng'], ['miao_fengxian', 'liu_cuihua'], ['liu_shuisheng', 'xiao_shun'], // 老村址：柳婆婆和陈大娘、老郑是老辈的老相识；两个手艺人；凤仙嫂和水生斗嘴
];
export const friendsOf = (id) => FRIENDS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));

export const RESIDENTS = HOUSEHOLDS.flatMap((h) => h.people.map((p) => ({ ...p, home: h.id, household: h.name })));

/**
 * 加一个新来的人（「来了个新人」卡片填的，见 life/newcomers.js）：进名册，挂在借住的那户底下（档案地图上标在那家院子上）。
 */
export function addResident(p) {
  const h = HOUSEHOLDS.find((x) => x.id === p.home);
  if (!p.oldHouse) p.household = `${h ? h.name.replace(/（.*）/, '') : ''}（借住）`; // 住老村址老宅的，household 在 newcomers.js 里写好了
  if (h && !h.people.includes(p)) h.people.push(p);
  if (!RESIDENTS.includes(p)) RESIDENTS.push(p);
}
