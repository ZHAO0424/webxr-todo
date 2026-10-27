/*
 * 名册的英文（英文界面用；中文界面不读这份）。键是 residents.js 里的 id。
 *   EN_VILLAGE：村名、简介；EN_HOUSEHOLDS：每户 { name, kind, note }；EN_PEOPLE：每人 { name, nick, relation, job, bio, story, likes, owns: [] }。
 *   名字用拼音（姓在前：Wang Deshan），村里的叫法意译（王村长 → Headman Wang、柳婆婆 → Granny Liu）。
 *   relation 指向家里别人的，一律以那人的英文全名加 "'s " 开头（名册会去掉这段前缀，只显示 wife / son 之类）。
 * 会什么（skills）、性格（traits）是公用的词，在 en-words.js 里按中文查。
 */
export const EN_VILLAGE = {
  name: 'Shiyu Village',
  intro: 'Shiyu Village sits deep in the Taihang Mountains. Its houses are built of rough fieldstone and roofed with slate. A stream runs past the front of the village, and a stone arch bridge over it is the only way in. '
    + 'It is the autumn harvest: the corn, sorghum and millet on the terraces have all turned gold, every rooftop is spread with drying corn, and on the threshing floor oxen drag stone rollers back and forth over the grain.',
};

export const EN_HOUSEHOLDS = {
  headman: {
    name: "The Wangs' (headman)", kind: 'Grey-brick courtyard house',
    note: 'The grandest house in the village, with a broad gateway, a spirit screen, a main hall with a front veranda, and east and west wings. Village affairs such as the ancestral hall and the well have always been in the Wangs\' hands.',
  },
  school: {
    name: 'School (Wang ancestral hall)', kind: 'Grey-brick ancestral hall',
    note: 'The main hall of the Wang ancestral hall doubles as the school on ordinary days. Teacher Li lives in the east wing.',
  },
  smith: {
    name: "Zhang\'s Smithy", kind: 'Stone house + open forge shed',
    note: 'Stands by the road at the village entrance. Every sickle, hoe and horseshoe in the village is made here.',
  },
  carpenter: {
    name: "Liu\'s Carpentry", kind: 'Stone house + open timber yard',
    note: 'The yard is piled with logs and cartwheels. The village\'s carts, ploughs, tables, chairs and benches, even the chests and cabinets for weddings, all come out of this workshop.',
  },
  tofu: {
    name: "Zhao\'s Tofu Shop", kind: 'Mud-brick house + donkey mill',
    note: 'Beans are ground every afternoon and the tofu is set at dusk, so the stove steams all day long. The soybeans all come from the family\'s own bean field on the west slope.',
  },
  store: {
    name: "Sun\'s Store", kind: 'Grey-brick shopfront on the road',
    note: 'Oil, salt, soy sauce and vinegar, needles and thread, matches and tobacco: it has everything, and two red shop banners hang out front.',
  },
  doctor: {
    name: "Zhou\'s Pharmacy", kind: 'Stone shopfront + herb-drying yard',
    note: 'Bamboo trays of drying herbs fill the yard, and a few hives of bees are kept out back. Their honey goes into making honey pills.',
  },
  shepherd: {
    name: "Ma\'s Sheepfold", kind: 'Stone cottage on the hillside + sheepfold',
    note: 'Halfway up the hill west of the village, the household farthest from the rest. The fold holds nine goats and sheep.',
  },
  farmA: {
    name: "The Chens'", kind: 'Stone house + pigsty + vegetable patch',
    note: 'An old couple getting by together; their son is an apprentice beyond the hills. Two black pigs and a brood of chickens in the yard, and a small vegetable patch outside the wall.',
  },
  farmB: {
    name: "The Yangs'", kind: 'Mud-brick house + cowshed',
    note: 'A farming family on the east side of the village. The corn and sorghum fields on the west slope are theirs, and the cowshed in the yard houses an old yellow ox.',
  },
  farmC: {
    name: "The Wus'", kind: 'Stone house + pigsty + rabbit hutch',
    note: 'A farming family up on the high ground north of the village. The millet and cabbage fields on the east slope are theirs; they keep pigs, chickens and rabbits in the yard, and the ducks and geese down by the stream are theirs too.',
  },
  square: {
    name: 'Village Square (stage, old locust tree)', kind: 'Open ground + opera stage + barber\'s hut',
    note: 'The whole village\'s "sitting room": by day people play chess and sit in the shade under the old locust tree; at night crowds gather in front of the stage. The barber\'s hut stands right beside the stage.',
  },
  riverTemple: {
    name: 'River God Temple (Liu)', kind: 'Small brick temple + mud-brick hut on the bank',
    note: 'The River God Temple stands on the edge of the loess bank, with a little mud-brick hut beside it. Granny Liu has kept the temple all her life; Shuisheng is the foundling she picked up on the riverbank and raised.',
  },
  mason: {
    name: "Ge\'s Mason Yard", kind: 'Rammed-earth house + open stone yard on the bank',
    note: 'Squared stone blocks are stacked in piles around the yard, and a half-finished millstone lies on the ground. The ring of the chisel goes from morning till night.',
  },
  limeKiln: {
    name: "Bai\'s Lime Kiln", kind: 'Flat-roofed hut + round rubble kiln on the bank',
    note: 'A lime kiln at the foot of the hill on the east end; white smoke rises from its top when it is firing. In front of the hut lie a heap of bluestone and a heap of finished lime.',
  },
  duckYard: {
    name: "Miao\'s Duck Shed", kind: 'Mud-brick hut + duck shed on the riverbank',
    note: 'The household nearest the water, with a reed fence around the duck shed. At first light the ducks go quacking down into the river.',
  },
};

export const EN_PEOPLE = {
  // -- 王家 --
  wang_deshan: {
    name: 'Wang Deshan', nick: 'Headman Wang', relation: 'Head of household', job: 'Headman & clan elder',
    bio: 'Three generations of Wangs have run the village\'s affairs. Boundary quarrels, weddings and funerals - villagers come to him first for a decision. Every evening he tucks his tobacco pipe into his jacket and goes to play chess with Old Chen under the old locust tree.',
    story: 'The Wangs have lived in Shiyu for seven generations, and two of their forebears served as village heads. As a young man Deshan spent three years on the mountain roads with a mule caravan; he saw the county yamen and the foreign-style school before coming home to take up his father\'s burden. The year a flash flood swept away the stone bridge at the village entrance, he went door to door gathering money and labour and led the village\'s young men in rebuilding it; the stone tablet at the bridgehead still bears every family\'s name. He never raises his voice, yet however fiercely two families are quarrelling, once he sits down between them half the heat goes out of it. His only worry is that his son and daughter-in-law work in the county town and come home just once a year.',
    likes: 'Chess, pipe tobacco, clapper opera',
    owns: ['A tabby cat (Tabs)'],
  },
  li_guilan: {
    name: 'Li Guilan', nick: 'Auntie Wang', relation: "Wang Deshan\'s wife", job: 'Farmer',
    bio: 'She was born in Lijiazhuang, beyond the hills. Whenever a family in the village holds a banquet, they ask her to run the kitchen, and at New Year half the window paper-cuts in the village are her work.',
    story: 'At nineteen she was carried over two ridges in a bridal sedan to marry into the Wang family. On her second day she went straight to the stove and rolled out a whole pot of long noodles for the household, and her name was made in the village. She is quick of tongue and warm of heart: whenever a young wife is lying in after childbirth or someone\'s old folk fall ill, she is the first at the door with a basket of eggs. In her hands a pair of scissors can cut magpies on plum blossom or a bumper harvest of the five grains, and in the twelfth month the children who come begging for window flowers line up outside her gate. Headman Wang\'s word is law out in the village, but at home, everything to do with firewood, rice, oil and salt is up to her.',
    likes: 'Dropping in on neighbours, paper-cutting',
    owns: [],
  },
  wang_xiaomei: {
    name: 'Wang Xiaomei', nick: 'Xiaomei', relation: "Wang Deshan\'s granddaughter", job: 'Pupil',
    bio: 'Her parents work in the county town, so she lives in the village with her grandparents. Her handwriting is the neatest in the school, and the teacher often praises her for it.',
    story: 'When Xiaomei was three, her mother and father went to work at a cloth shop in the county town and left her with her grandparents. New Year is what she longs for most, because her parents bring home a bag of foreign sweets and a new picture book. She loves learning characters with Teacher Li and knows more poems by heart than anyone in the school, yet the moment she is called to stand up in front of everyone, she blushes to the tips of her ears. Every letter her parents send is tucked under her pillow, and before she sleeps she sneaks one more read.',
    likes: 'Hopscotch, the teacher\'s stories',
    owns: [],
  },
  // -- 学堂 --
  li_wenqing: {
    name: 'Li Wenqing', nick: 'Teacher Li', relation: 'Lives alone', job: 'Schoolteacher',
    bio: 'He studied in the county town as a young man and came to teach in the village at Headman Wang\'s invitation. Every New Year he writes the spring couplets for every household, charging nothing but a couple of steamed buns.',
    story: 'Teacher Li comes from Lijiazhuang beyond the hills, which makes him and Auntie Wang something like fellow villagers. As a young man he spent a few years in the new-style schools of the county town and hoped to find a post in the provincial capital, but his family fell on hard times and he had to go home. Headman Wang called on him three times, offering a room in the ancestral hall and two piculs of millet a year to teach the village children, and he has been teaching ever since - more than ten years now. He is strict with his pupils, yet his ruler always comes down gently; when a family cannot pay the school fee, he lets the child sweep the yard instead.',
    likes: 'Calligraphy, plain tea',
    owns: [],
  },
  // -- 张家铁匠铺 --
  zhang_tiechui: {
    name: 'Zhang Tiechui', nick: 'Smith Zhang', relation: 'Head of household', job: 'Blacksmith',
    bio: 'He learned smithing from his father. Around the autumn harvest is the shop\'s busiest season, with every sickle in the village waiting for an edge. His wife died of illness a few years ago, and he is raising his son Dabao on his own.',
    story: 'The Zhangs have been smiths for four generations; the old anvil in the shop is the one his grandfather carried home on his back from beyond the hills. As a young man Tiechui was strong and hot-tempered, ready to come to blows after a couple of sharp words, and only after marrying Dabao\'s mother did he slowly settle down. One winter a chill took Dabao\'s mother and she did not pull through. For three days he did not light the forge; on the fourth, before dawn, the clang of the hammer rang out from the shop again. He says even less these days. Only when he hears Dabao reading aloud in the house does he put down his hammer and break into a grin.',
    likes: 'Sorghum liquor, the sound of his son reading',
    owns: ['A yellow dog (Goldie)'],
  },
  xiao_shun: {
    name: 'Liu Xiaoshun', nick: 'Xiaoshun', relation: 'Apprentice (boards here)', job: 'Smith\'s apprentice',
    bio: 'An orphan from the next village, he came to the smithy at thirteen to learn the trade. He worked the bellows for four whole years, and only lately has his master finally let him swing the sledgehammer.',
    story: 'Xiaoshun is from Liujiagou, the next village over. At eight he lost both parents to illness, one after the other, and grew up eating at whichever table would have him. When he was thirteen, Smith Zhang came to Liujiagou to buy scrap iron, saw the boy squatting by the road watching a man mend a plough for a whole afternoon, and asked him whether he would like to learn smithing. For the first three years he did nothing but work the bellows, chop firewood and carry water, sleeping at night beside the forge shed. He loves hearing the peddler talk about the world beyond the hills, and says that once he finishes his apprenticeship he will open a smithy of his own in the county town.',
    likes: 'The peddler\'s tales of the outside world',
    owns: [],
  },
  zhang_dabao: {
    name: 'Zhang Dabao', nick: 'Dabao', relation: "Zhang Tiechui\'s son", job: 'Pupil',
    bio: 'The ringleader of the schoolchildren. The moment school lets out he is off racing round the village with a pack of younger kids at his heels, and he has felt the teacher\'s ruler more than once for it.',
    story: 'Dabao is the village\'s best-known ringleader: climbing trees, raiding birds\' nests, shooting a slingshot - he is good at all of it, and the teacher\'s ruler has come down on his palm many a time. He was only six the year his mother died, and since then he has learned to boil his own water and mend his own clothes. He never says he misses her, but every Qingming he slips off to the hillside to pick a handful of wildflowers. When the smaller children are picked on, they all come to him, and he thumps his chest and says, "As long as I\'m here, nobody\'s going to bully you."',
    likes: 'The persimmon tree, grasshoppers',
    owns: [],
  },
  // -- 刘家木匠铺 --
  liu_youfu: {
    name: 'Liu Youfu', nick: 'Carpenter Liu', relation: 'Head of household', job: 'Carpenter',
    bio: 'His mortise-and-tenon work is known far and wide. Right now he is mending the Yangs\' cartwheels, and has to finish before the autumn harvest begins.',
    story: 'Carpenter Liu learned his craft from an old master beyond the hills - seven full years of it. He is the most exacting of workmen: if a tenon is off by a hair he will take the whole thing apart and start again, and the villagers tease him as "One-More-Plane Liu". No house goes up, no wedding happens, no furniture gets made without him. He loves working out new designs; the counter with drawers he built for Shopkeeper Sun last year won praise even from merchants up from the county town. He always hums a little tune as he works, and by the end of the day the shavings are piled up to his knees.',
    likes: 'New designs, little tunes',
    owns: [],
  },
  he_xiulan: {
    name: 'He Xiulan', nick: 'Mrs. Liu', relation: "Liu Youfu\'s wife", job: 'Farmer & gardener',
    bio: 'Carpenter Liu\'s wife, who keeps a cabbage patch on the west slope. Every autumn she pickles two big crocks of sour cabbage to see the family through the winter.',
    story: 'Mrs. Liu is a daughter of the He family here in the village and has known Carpenter Liu since they were small. She cannot sit still: she is up before dawn to carry water, spends the day weeding and watering her vegetable patch on the west slope, and in the evening stitches shoe soles by the oil lamp - every pair of shoes in the family of three is her work. Her pickled cabbage is soured just right, and once winter comes the neighbours often turn up with a bowl to ask for some. She is a great worrier: if her husband goes out and forgets his food, she will chase him half a li down the road to hand it over.',
    likes: 'Chatting with Auntie Wang',
    owns: ['A vegetable patch on the west slope'],
  },
  liu_erya: {
    name: 'Liu Erya', nick: 'Erya', relation: "Liu Youfu\'s daughter", job: 'Pupil',
    bio: 'Carpenter Liu\'s daughter, forever running along behind Dabao. When Dabao climbs a tree, she waits underneath, gazing up.',
    story: 'Erya is the Lius\' only daughter. She was born smiling and greets everyone she meets sweetly. Her favourite thing is to trail after big brother Dabao: when he climbs a tree she waits beneath it with her head tipped back, and when he raids a nest he always saves her an egg. Her red hair ribbon was bought by her mother at the market and she treasures it so much she won\'t wear it on rainy days. Her wish is to grow up and cut window paper-cuts as lovely as Auntie Wang\'s.',
    likes: 'Red hair ribbons, sweet dates',
    owns: [],
  },
  // -- 赵家豆腐坊 --
  zhao_mantun: {
    name: 'Zhao Mantun', nick: 'Tofu Zhao', relation: 'Head of household', job: 'Tofu maker',
    bio: 'Tofu-making runs in his family. In the afternoon he drives the donkey round the mill grinding beans; at dusk he boils the soy milk and sets the curds; and early next morning he carries the tofu on his shoulder pole to market beyond the hills.',
    story: 'The Zhaos\' tofu shop has been running in the village for nearly a hundred years, and the recipe for setting the curds passes only to the eldest son. Mantun took over at fifteen and in twenty-odd years has hardly ever slept in: in the small hours he grinds the beans, boils the milk and sets the curds, and at first light he shoulders his load and crosses the hills to market. He talks to his grey donkey more than to people, and often says, "Grey knows more about tofu than I do." Whenever a family in the village has a happy occasion he sends over two boards of tofu and never takes a coin for it.',
    likes: 'Talking to his donkey',
    owns: ['A grey donkey (Grey)', 'A soybean field on the west slope'],
  },
  feng_yuzhen: {
    name: 'Feng Yuzhen', nick: 'Mrs. Zhao', relation: "Zhao Mantun\'s wife", job: 'Tofu shop helper',
    bio: 'Everyone agrees her tofu pudding is the silkiest in the village. Every evening she carries a basin of tofu to the front of the stage and cuts off a piece for whoever wants one.',
    story: 'Mrs. Zhao comes from Fengjiaji beyond the hills and was only eighteen when she married in. She has a bright, carrying voice and loves a joke, and the tofu shop is never dull while she is in it. Her tofu pudding is so tender it trembles, and with a spoonful of savoury sauce on top it is what the village children crave most. She adores opera: whenever there is a performance at the Village Square, she is there early with her tofu, squeezing to the front row and humming along as she sells.',
    likes: 'Opera',
    owns: [],
  },
  zhao_shitou: {
    name: 'Zhao Shitou', nick: 'Shitou', relation: "Zhao Mantun\'s son", job: 'Pupil',
    bio: 'Tofu Zhao\'s son. He can never get his lessons by heart, but driving the donkey round the mill he is a natural.',
    story: 'Shitou is solidly built; at eight he could already help his father carry half a sack of soybeans. Book learning does not come easily: after half a year he still stumbles through the Three Character Classic, and the teacher sighs in despair. But the moment he steps into the mill he is an expert - when to turn the donkey round, how many times the beans need grinding, he knows better than anyone. In his heart he settled long ago that he will take over his father\'s tofu shop and make the best tofu in the village.',
    likes: 'Tofu pudding, riding the donkey',
    owns: [],
  },
  // -- 孙家杂货铺 --
  sun_youcai: {
    name: 'Sun Youcai', nick: 'Shopkeeper Sun', relation: 'Head of household', job: 'Shopkeeper',
    bio: 'Twice a month he goes to the county town beyond the hills to restock. When villagers are short of money they can buy on credit and settle up at the end of the year.',
    story: 'The Suns were small traders from beyond the hills who only settled in Shiyu in Youcai\'s grandfather\'s day. The store has everything from oil, salt, soy sauce and vinegar to needles and thread, and you can ask him to bring back medicine or cloth from the county town. His abacus clicks like lightning, yet he keeps his accounts generously: in bad years some families run up a whole year\'s credit. Every trip to town he brings back a few old newspapers, and in the evening there is always a ring of people in the shop listening to him tell the news from outside.',
    likes: 'Doing the accounts, current affairs',
    owns: ['A ginger cat (Ginger)'],
  },
  xiao_liuzi: {
    name: 'Zhou Liuzi', nick: 'Little Six', relation: 'Shop boy (lives in the store)', job: 'Shop boy',
    bio: 'A distant nephew of Doctor Zhou, learning the trade at the store. Sweeping the street, hauling goods and making deliveries all fall to him, and when the light fades he goes round lighting the torches at the crossroads one by one.',
    story: 'Little Six is a distant nephew of Doctor Zhou. His home is in Zhoujiayu, thirty li away, and he was sent here at fifteen to learn shopkeeping. Sweet of tongue and quick on his feet, he greets everyone with a smile, and the aunties and grannies of the village all dote on him. Every day he is up before dawn to sweep the street in front of the shop, and at dusk he lights the torches at the crossroads one after another. What he looks forward to most is opera at the Village Square; in the days the stage is up, he works with extra zest.',
    likes: 'The bustle around the opera stage',
    owns: [],
  },
  sun_shuanzi: {
    name: 'Sun Shuanzi', nick: 'Shuanzi', relation: "Sun Youcai\'s son", job: 'Pupil',
    bio: 'Shopkeeper Sun\'s son. His father hopes he will take over the store one day, but all he wants is to be a teacher like Teacher Li.',
    story: 'Shuanzi is Shopkeeper Sun\'s only son, and from the time he was small his father sat him down at the abacus to practise flicking beads. But his heart is in his books; he will read the same picture-story book dozens of times over. He is timid and dares not walk alone after dark, yet in front of the teacher he can recite a whole classical essay in one breath. He has secretly told Teacher Li that when he grows up he wants to go to school in the county town and then come back to teach in the village.',
    likes: 'Books, picture-story books',
    owns: [],
  },
  // -- 周家药铺 --
  zhou_jishi: {
    name: 'Zhou Jishi', nick: 'Doctor Zhou', relation: 'Lives alone', job: 'Herbal doctor',
    bio: 'He has practised medicine in the village for forty years and delivered half the people in it. Every evening he takes his medicine chest to Aunt Chen\'s to treat her old rheumatic legs.',
    story: 'As a young man Doctor Zhou apprenticed at a pharmacy beyond the hills; in his twenties he came back to the village and has stayed forty years. He delivered most of the people here, and whether it is a child with a fever or an old man with a bad back, he has never turned anyone away, even when they knock at midnight. Each spring and autumn he goes up the mountain to gather herbs, the yard behind the pharmacy is covered with them drying, and the air always carries a bitter fragrance. He has grown hard of hearing, so you have to lean in close and shout, but when he takes a pulse, he knows how serious it is the moment his fingers touch the wrist.',
    likes: 'Sitting in the sun, his beehives',
    owns: ['Three hives of bees'],
  },
  // -- 马家羊圈 --
  ma_laoliu: {
    name: 'Ma Laoliu', nick: 'Shepherd Ma', relation: 'Lives alone', job: 'Shepherd',
    bio: 'He never married and has spent half his life with his flock. In the afternoon he drives the sheep up the slope to graze, and before sundown one crack of his whip brings the whole flock home to the fold.',
    story: 'Ma Laoliu has herded sheep with his father since he was twelve, and in all his life he has never left these hills. He lives alone in the stone cottage halfway up the slope and usually says very little; only out on the hillside does he let his voice go in mountain songs that carry across to the ridge opposite. The villagers call him a loner, but whenever someone\'s sheep falls sick or goes missing, he is always the first to help look. His black dog Blackie has been with him eight years and is his closest companion.',
    likes: 'Mountain songs, his black dog Blackie',
    owns: ['Nine sheep', 'A black dog (Blackie)'],
  },
  // -- 陈家 --
  chen_mancang: {
    name: 'Chen Mancang', nick: 'Old Chen', relation: 'Head of household', job: 'Old farmer (veg & pigs)',
    bio: 'He farmed all his life; now his legs are failing and he only tends the vegetable patch outside the yard. He has played chess with Headman Wang for thirty years and lost more than he has won, though you will never hear him admit it.',
    story: 'Old Chen worked the land all his life; as a young man he could plough the three mu on the east slope single-handed. Now his legs are not what they were, and he keeps just the vegetable patch outside the yard and his two pigs. He reads the sky well: if he says it will rain tomorrow, rain it will, and before bringing in the harvest the villagers all come to ask him. He has played chess with Headman Wang for thirty years, losing more than winning, and every time he loses he mutters, "Again tomorrow." When he has a free morning he shoulders his bamboo rod and goes fishing at the pool in the West Gully.',
    likes: 'Pipe tobacco, chess, sitting in the sun; in the mornings, walking out to fish in the pool under the West Gully waterfall',
    owns: ['Two black pigs'],
  },
  chen_daniang: {
    name: 'Zhao Fengying', nick: 'Aunt Chen', relation: "Chen Mancang\'s wife", job: 'Farmer',
    bio: 'Old rheumatism in her legs means she needs a stick to get about. Any child who passes her gate can always beg a red date from her.',
    story: 'In her youth Aunt Chen was the fastest spinner in the village and could keep her wheel turning till midnight. Later the cold settled into her legs and she has to walk with a stick, yet she has not let a single household task drop. Her children have all settled far away and the yard is lonely, so she loves it when the children drop by, and her pockets are always full of red dates and roasted peanuts. Doctor Zhou comes every evening to see to her legs, and she always makes him stay for a bowl of millet porridge before he goes.',
    likes: 'Sitting in the sun, children at play',
    owns: ['A brood of chickens'],
  },
  // -- 杨家 --
  yang_erniu: {
    name: 'Yang Erniu', nick: 'Brother Yang', relation: 'Head of household', job: 'Farmer',
    bio: 'The second son of the family. This year both the corn and the sorghum have done well, and these afternoons he takes the old yellow ox to the threshing floor to thresh.',
    story: 'Yang Erniu is the second son. His elder brother went off to work beyond the Great Wall years ago, so the land fell on his shoulders. The old yellow ox has been with him twelve years, and ploughing, hauling and threshing all depend on it. The rains were good this year and the corn and sorghum came in two-tenths better than usual; he has asked Carpenter Liu to mend the cart so that after harvest he can haul grain to market and get a good price. He likes to keep up appearances: when guests come, however tight things are, a pot of liquor goes on the table.',
    likes: 'His old yellow ox, sorghum liquor',
    owns: ['A yellow ox (Old Yellow)', 'Corn and sorghum fields on the west slope', 'A black dog'],
  },
  liu_cuihua: {
    name: 'Liu Cuihua', nick: 'Mrs. Yang', relation: "Yang Erniu\'s wife", job: 'Farmer & stock keeper',
    bio: 'A distant cousin of Carpenter Liu, she looks after the family\'s chickens and the ox\'s fodder. If anyone\'s child picks on Xiaohu, she will chase them all the way to their own front door.',
    story: 'Cuihua is a distant cousin of Carpenter Liu and married in from Liujiaping over the mountain. She is deft and quick: feeding the chickens and the ox, cooking, husking corn, she is busy from dawn to dark and never complains. She has a fiery temper and nobody can stop her when she is defending her son; once, when Xiaohu was shoved over by a bigger boy, she chased him all the way home to demand an explanation. What she looks forward to most is the temple fair, where every year she buys a length of flowered cloth to make Xiaohu a new suit of clothes.',
    likes: 'Temple fairs',
    owns: ['A brood of chickens'],
  },
  yang_xiaohu: {
    name: 'Yang Xiaohu', nick: 'Xiaohu', relation: "Yang Erniu\'s son", job: 'Too young for school',
    bio: 'Not yet old enough for school, he spends all day running round the village holding up the kite his father made him, waiting for Dabao and the others to get out of school.',
    story: 'Xiaohu is not old enough for school yet, and what he waits for most each day is the bell that lets the school out. His father made him a swallow kite, and he carries it high wherever he goes - he won\'t even put it down to eat. He worships big brother Dabao and always wants to tag along to climb trees and raid nests, but every time his mother hauls him home by the collar. His greatest wish is to one day ride the old yellow ox all the way round the village.',
    likes: 'Kites, riding the ox',
    owns: ['A kite'],
  },
  // -- 吴家 --
  wu_dachuan: {
    name: 'Wu Dachuan', nick: 'Brother Wu', relation: 'Head of household', job: 'Farmer & porter',
    bio: 'In the slack season he carries goods into the mountains for Shopkeeper Sun. These days he is harvesting millet on the east slope and carrying it home load after load.',
    story: 'Wu Dachuan says little, but he works like two men. In the slack season he carries goods into the mountains for Shopkeeper Sun, well over a hundred jin on his shoulder pole, crossing two ridges without a rest. He broke the millet field on the east slope out of wasteland one mattock-stroke at a time, and now it yields several piculs of millet a year. What he loves most is a bowl of hot millet rice with his wife\'s pickles and a pipe of tobacco after - that is the good life to him.',
    likes: 'Millet rice, pipe tobacco',
    owns: ['Millet and cabbage fields on the east slope', 'Two pigs'],
  },
  sun_qiaoyun: {
    name: 'Sun Qiaoyun', nick: 'Mrs. Wu', relation: "Wu Dachuan\'s wife", job: 'Farmer, ducks & geese',
    bio: 'A cousin of Shopkeeper Sun, she looks after the family\'s chickens, ducks, geese and rabbits. Every evening she goes down to the stream to drive the ducks and geese home.',
    story: 'Qiaoyun is Shopkeeper Sun\'s cousin. Since marrying into the Wu family she has turned a poor household into a well-run one. She raised every chicken, duck, goose and rabbit in the yard herself and can call each one by name. She is sharp with money and makes every copper count; in a few years she saved enough to add a hutch of rabbits and two pigs. Every evening she goes down to the stream calling the ducks and geese home, and the whole village can hear her.',
    likes: 'Rabbits',
    owns: ['A brood of chickens', 'Five ducks', 'Four geese', 'A hutch of rabbits'],
  },
  wu_xiaocui: {
    name: 'Wu Xiaocui', nick: 'Xiaocui', relation: "Wu Dachuan\'s daughter", job: 'Pupil',
    bio: 'Wu Dachuan\'s daughter. Every day after school she gives the rabbits fresh grass first, then goes down to the stream to help her mother drive the ducks home.',
    story: 'Xiaocui is the Wus\' elder daughter, and at ten she is already her mother\'s right hand. Every day after school she gives the rabbits a handful of fresh grass, then takes a bamboo pole down to the stream to help her mother herd the ducks. She has a way with words: when anyone at school falls out, a few words from her and they make up. She has given every rabbit a name; the smallest, a white one, is called "Snowball".',
    likes: 'Rabbits, red hair ribbons',
    owns: [],
  },
  // -- 村口 --
  zheng_laotou: {
    name: 'Zheng Shouyi', nick: 'Barber Zheng', relation: 'Lives alone', job: 'Barber',
    bio: 'He has kept his barber\'s stall at the Village Square for twenty years. He tells old tales as he shaves his customers, and all the news from miles around spreads from here.',
    story: 'As a young man Barber Zheng travelled far and wide with an opera troupe; when his voice gave out, he learned the barber\'s trade. Twenty years ago he set up his barber\'s stall under the old locust tree at the Village Square and has not moved since. As he shaves a man he holds forth on past and present, from the Three Kingdoms to the Water Margin, and all the news from miles around spreads from his chair. His hand is steady: his razor can travel all the way round a scalp without leaving a single nick.',
    likes: 'Telling old tales, opera',
    owns: [],
  },
  qian_xiaoer: {
    name: 'Qian Xiaoer', nick: 'The Peddler', relation: 'Outsider (lodges at the store)', job: 'Peddler',
    bio: 'He comes over the mountain with his peddler\'s pole every two weeks. He goes from village to village and door to door, trading needles and thread, hair ribbons and sweets for goods; the moment the children hear his rattle drum in the distance they all come flocking.',
    story: 'Qian Xiaoer is from Qianjiazhuang beyond the hills and took up the peddler\'s pole at sixteen. He has walked to every one of the dozens of villages, large and small, in the Taihang Mountains, and he knows by heart which village\'s wives like to buy embroidery thread and which village\'s children crave malt candy. He comes to Shiyu every two weeks and lodges at Shopkeeper Sun\'s store. He has seen a great deal, and when he talks about the news from outside, even Barber Zheng pricks up his ears.',
    likes: 'Chatting with Xiaoshun',
    owns: ['A peddler\'s carrying pole and baskets'],
  },
  niu_wanshan: {
    name: 'Niu Wanshan', nick: 'Boss Niu', relation: 'Outsider (mule caravan, comes on market days)', job: 'Muleteer',
    bio: 'He drives three mules in from the county town beyond the hills. Early on market day - the 5th, 10th, 15th and so on of each month - he comes in along the foot of the West Gully cliffs by the old cliffside road, bringing salt, machine-made cloth, iron pots and matches, and taking away walnuts, dried persimmons, medicinal herbs and mountain produce. When the market breaks up at noon he goes back the way he came.',
    story: 'Niu Wanshan has driven mule caravans for over twenty years; he could walk the Taihang\'s cliffside roads and narrow ledges with his eyes shut. He is open-handed and a man of his word above all: he promised to come on the fives and tens, and wind or rain he has never missed a day. Salt, cloth and iron pots in, walnuts, dried persimmons and herbs out, and his accounts have never been a single coin off. Every time before the market breaks up, he sits down with Shopkeeper Sun over a pot of liquor, and only sets off once the books are squared.',
    likes: 'A pot of liquor, squaring accounts with Shopkeeper Sun',
    owns: ['Three pack mules (Dapple, Ebony, Patchface)'],
  },
  shi_wa: {
    name: 'Shi Wa', nick: 'Little Porter', relation: 'Outsider (mule caravan, comes on market days)', job: 'Caravan hand',
    bio: 'A distant nephew of Boss Niu, he travels the mountain roads with the caravan to learn the trade. He walks behind the mules and gives the pack baskets a push on the uphill stretches.',
    story: 'Shi Wa is a distant nephew of Boss Niu, from Shijiagou over the mountain, and came out with the caravan at sixteen to learn trading. He is shy and quiet and blushes in front of strangers, but he is very quick on his feet, always the first to dash up a slope and push the mules\' pack baskets. He loves the sweets at the store by the Village Square and buys two every time he comes: one for himself, and one to save for his little sister at home.',
    likes: 'The sweets at the Village Square store',
    owns: [],
  },
  // -- 老村址 --
  liu_popo: {
    name: 'Liu Guizhi', nick: 'Granny Liu', relation: 'Head of household', job: 'Temple keeper & river watcher',
    bio: 'Her husband was lost the year of the great flood. When the whole village moved away she stayed, and for sixty years she has kept the River God Temple. Every morning and evening she burns a stick of incense to the River God, then goes to read the water at the flood stele.',
    story: 'Liu Guizhi married into Old Shiyu at eighteen, and the summer she was twenty-two the great flood came. Her husband went to carry a neighbour\'s child down from a rooftop and never came back to shore. When the water went down, most families moved downstream, but she would not go; she said her husband was still in this river. She built a little hut on the bank and kept watch over the River God Temple that was later raised there, and she has kept it sixty years. She remembers exactly where every family in Old Shiyu lived and what tree stood by whose door. Anyone new who wants to settle here has to see her first.',
    likes: 'The old crooked willow, sitting in the sun, anyone who will listen to her old stories',
    owns: ['The key to the River God Temple'],
  },
  liu_shuisheng: {
    name: 'Liu Shuisheng', nick: 'Shuisheng', relation: "Liu Guizhi\'s grandson (raised by her)", job: 'Driftwood & raft man',
    bio: 'He floated down the river as a swaddled baby, and Granny Liu picked him up off the riverbank and raised him. These days he spends every day on the riverbank fishing out driftwood washed down from upstream, drying it and chopping it to sell as firewood.',
    story: 'Nineteen years ago, on a morning when the river was in flood, Granny Liu found a wooden basin caught among the roots of a willow on the riverbank; in it was a baby who had cried himself hoarse. She named him Shuisheng, "born of the water". He grew up by the river and swims better than a fish; with a single bamboo pole he can pole back and forth on either side of the midstream island. He says little and is very strong; every day he hauls driftwood and chops firewood, and every coin he saves goes to his granny. The village girls say he is handsome, just far too quiet.',
    likes: 'The midstream island, Granny\'s cornmeal porridge',
    owns: ['A bamboo punting pole', 'A wooden raft'],
  },
  ge_shitou: {
    name: 'Ge Changgeng', nick: 'Stonemason Ge', relation: 'Lives alone', job: 'Stonemason',
    bio: 'He came from beyond the hills to work on the river embankment and simply stayed. Whenever a millstone in the village wears smooth, he is the one called to re-dress it, and he carved the characters on the flood stele.',
    story: 'Ge Changgeng is a stonemason from Hebei. At thirty he came to Old Shiyu with his master to build the river embankment. When the embankment was done his master went home, but he stayed - the stone on this riverbank is good, he says, fine bluestone, and a millstone cut from it won\'t crumble. He lives alone on the bank, chipping at stone all day long, and you could beat him with a stick three times and not get a word out of him. Yet whenever anyone needs a wall footing laid, a kang built or a pigsty mended, one shout and he comes, and takes whatever he is given.',
    likes: 'Good stone, a bowl of liquor',
    owns: ['A set of stone chisels', 'A cartload of stone blocks'],
  },
  bai_laohui: {
    name: 'Bai Shoucheng', nick: 'Old Lime Bai', relation: 'Lives alone', job: 'Lime burner',
    bio: 'All year round he is dusted with lime, so everyone calls him Old Lime Bai. Building houses, plastering walls, pointing joints, whitewashing rooms - all the lime comes from his kiln.',
    story: 'Bai Shoucheng\'s father burned lime too. The kiln used to stand at the east end of Old Shiyu; the great flood brought it down once, and father and son built it up again stone by stone. Since his father died he has kept the kiln alone, quarrying bluestone from the east hills and buying firewood from Shuisheng. He is a great natterer and tells everyone he meets, "A house is three parts brick and tile, seven parts lime." Every day he hopes someone will come and repair the tumbledown houses at the Old Site - every one of them would be his customer.',
    likes: 'A pot of liquor, chattering at people',
    owns: ['A lime kiln'],
  },
  miao_fengxian: {
    name: 'Miao Fengxian', nick: 'Sister Fengxian', relation: 'Head of household (husband works beyond the hills)', job: 'Duck keeper & egg seller',
    bio: 'Her husband labours beyond the hills year in, year out, and she keeps a flock of ducks on the riverbank on her own. She carries the duck eggs to the village to sell, and her salted duck eggs are rich enough to ooze oil.',
    story: 'Miao Fengxian married in. Her husband\'s family also used to live in Old Shiyu, but moved away after the great flood, leaving only this plot by the riverbank. Her husband labours at a coal pit beyond the hills and comes home twice a year. Finding the village too full of rules, she simply moved down to the riverbank to keep ducks and be her own mistress. She is loud and loves to laugh, singing folk tunes as she drives her ducks, and Granny Liu up on the bank always says, "When Fengxian sings, this bend of the river comes alive."',
    likes: 'Singing folk tunes, bickering with Shuisheng',
    owns: ['A dozen-odd ducks', 'A big crock for salting eggs'],
  },
};
