# 背景音乐

五首北方民乐风的慢曲，由本地 Stable Audio 3（small_music 模型，8 步、cfg 1）生成，授权为 **Stable Audio Community License，仅限非商用**；以后要商用需另购授权或换曲。

后期处理：高频压低（highshelf 3.5 kHz −8 dB + lowpass 7 kHz）、去掉曲中超过 1.2 秒的停顿、开头 2 秒淡入、响度统一到 −20 LUFS，96 kbps mp3。

| 文件 | 曲名 | 乐器 | 什么时辰放（见 src/music.js） | seed |
|---|---|---|---|---|
| chenwu.mp3 | 晨雾炊起 | 笙、低音箫 | 5:00–10:00 | 333 |
| jinyun.mp3 | 晋韵小院 | 坠胡、扬琴低音 | 8:00–17:00 | 343 |
| shiyuan.mp3 | 石院暮色 | 二胡、古筝 | 9:00–18:00 | 137 |
| chuiyan.mp3 | 傍晚炊烟 | 二胡、古筝 | 16:30–21:00 | 137 |
| qiuye.mp3 | 秋夜檐下 | 中胡、古筝、大提琴 | 19:00–次日 5:00 | 313 |
