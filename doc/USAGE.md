# 利用ガイド

TubeJellyは、登録済みユーザーがDiscordまたはLINEからYouTubeのURLを送信し、音楽またはMusicVideoを保存するBotです。

- 音楽: MP3としてユーザーごとの音楽保存先へ保存
- MusicVideo: MP4としてユーザーごとの動画保存先へ保存
- YouTube動画、ライブURL、プレイリストに対応
- 未登録ユーザーは利用できません

## 1. 使い始める前に

管理者に次のIDを登録してもらってください。

- Discord: Discord User ID
- LINE: LINE User ID

登録内容は`.env`の`USERS_CONFIG_JSON`で管理します。ユーザーごとに`MUSIC_DL_DIR`と`VIDEO_DL_DIR`が割り当てられます。

保存したファイルをJellyfinで認識させるには、Jellyfinのライブラリがホスト側の`MUSIC_HOST_PATH`と`VIDEO_HOST_PATH`を参照するように設定してください。

## 2. Discordの使い方

### 基本操作

BotとのDM、またはBotが参加しているサーバーでスラッシュコマンドを使用します。利用可能なコマンドは`/help`でも確認できます。

| コマンド          | 内容                                         |
| ----------------- | -------------------------------------------- |
| `/add`            | YouTube動画を音楽として保存                  |
| `/add_list`       | YouTubeプレイリストを音楽として一括保存      |
| `/video`          | YouTube動画をMusicVideoとして保存            |
| `/list`           | 音楽一覧を表示                               |
| `/video_list`     | MusicVideo一覧を表示                         |
| `/edit`           | 音楽のタイトル、アーティスト、アルバムを編集 |
| `/delete`         | 音楽を一覧番号で削除                         |
| `/video_delete`   | MusicVideoを一覧番号で削除                   |
| `/artists list`   | アーティスト一覧を表示                       |
| `/artists rename` | アーティスト名を一括変更                     |
| `/help`           | Discordでのヘルプを表示                      |

### 音楽を1曲保存

```text
/add url:https://www.youtube.com/watch?v=xxxxxxxxxxx
```

メタデータを指定する場合:

```text
/add url:https://www.youtube.com/watch?v=xxxxxxxxxxx title:曲名 artist:アーティスト album:アルバム
```

`url`は必須です。`title`、`artist`、`album`は省略できます。既に同じ音楽が保存済みの場合は重複保存されません。

### MusicVideoを保存

専用コマンドを使います。

```text
/video url:https://www.youtube.com/watch?v=xxxxxxxxxxx
```

`/add`の`video`オプションを有効にしてMusicVideoとして保存することもできます。

```text
/add url:https://www.youtube.com/watch?v=xxxxxxxxxxx video:true
```

Discordの入力画面では、`video`を真偽値として有効にしてください。

### プレイリストを一括保存

```text
/add_list url:https://www.youtube.com/playlist?list=xxxxxxxxxxx
```

全曲にメタデータを適用したり、上限を指定したりできます。

```text
/add_list url:https://www.youtube.com/playlist?list=xxxxxxxxxxx artist:アーティスト album:アルバム max:10
```

MusicVideoとして保存する場合は`video`を有効にします。`max`を省略すると、取得したプレイリスト内の動画を処理します。

### 一覧、編集、削除

まず一覧で番号を確認します。

```text
/list
/video_list
```

音楽のメタデータを編集します。少なくとも`title`、`artist`、`album`のどれか1つを指定してください。

```text
/edit index:3 title:新しい曲名 artist:新しいアーティスト album:アルバム名
```

音楽またはMusicVideoを削除します。削除したファイルは復元できません。

```text
/delete index:3
/video_delete index:2
```

### アーティストを管理

```text
/artists list
/artists rename old:旧アーティスト new:新アーティスト
```

`rename`は一致する音楽ファイルのアーティスト名をまとめて変更します。ファイルのメタデータと、アルバム情報がある場合の保存先も更新されます。

## 3. LINEの使い方

LINE公式アカウントとの1対1トークでテキストを送信します。LINE User IDが登録済みである必要があります。

### URLを直接送信

URLだけを送信すると音楽として保存します。

```text
https://www.youtube.com/watch?v=xxxxxxxxxxx
https://www.youtube.com/playlist?list=xxxxxxxxxxx
```

本文に`動画`を含めるとMusicVideoとして保存します。

```text
動画 https://www.youtube.com/watch?v=xxxxxxxxxxx
```

### LINEコマンド一覧

コマンドの先頭に`/`を付けても付けなくても使用できます。オプションは`名前=値`形式です。値に空白を含める場合は、値を引用符で囲んでください。

| コマンド                                      | 内容                             |
| --------------------------------------------- | -------------------------------- |
| `help`                                        | LINEコマンド一覧を表示           |
| `id`                                          | 自分のLINE User IDを表示         |
| `list [page=1]`                               | 音楽一覧を10件ずつ表示           |
| `add URL [title=] [artist=] [album=]`         | 音楽を1曲保存                    |
| `add_list URL [artist=] [album=] [max=10]`    | プレイリストを音楽として一括保存 |
| `delete index=3`                              | 音楽を一覧番号で削除             |
| `edit index=3 title=... artist=... album=...` | 音楽のメタデータを編集           |
| `artists list`                                | アーティスト一覧を表示           |
| `artists rename old=... new=...`              | アーティスト名を一括変更         |

### LINEコマンドの例

ヘルプを表示します。

```text
help
```

タイトルやアーティストを指定して保存します。URLはコマンドの後ろに置きます。

```text
add https://www.youtube.com/watch?v=xxxxxxxxxxx title="曲名" artist="アーティスト" album="アルバム"
```

プレイリストから最大10件を保存します。

```text
add_list https://www.youtube.com/playlist?list=xxxxxxxxxxx artist="アーティスト" max=10
```

一覧を表示し、次のページを確認します。

```text
list
list page=2
```

メタデータを編集します。変更する項目を1つ以上指定してください。

```text
edit index=3 title="新しい曲名" artist="新しいアーティスト"
```

アーティスト名を一括変更します。

```text
artists list
artists rename old="旧アーティスト" new="新アーティスト"
```

LINEではMusicVideo専用の一覧・削除コマンドはありません。MusicVideoの保存はURL本文に`動画`を含めて実行してください。

## 4. 利用時の注意

- 一覧の番号は現在の保存先に対する番号です。削除・編集前に最新の一覧を確認してください。
- プレイリストの大量保存では、保存先の容量とYouTubeへのアクセス制限に注意してください。
- ダウンロード中はBotから進捗メッセージが送信されます。
- YouTubeの利用規約、著作権、地域の法令に従って利用してください。
- Token、Channel secret、Cloudflare Tunnel tokenをチャットやIssueへ貼り付けないでください。

## 5. 関連ドキュメント

- [セットアップガイド](setup/GETTING_STARTED.md)
- [Linux運用ガイド](RASPBERRY_PI_OPERATIONS.md)
- [トラブルシューティング](TROUBLESHOOTING.md)
