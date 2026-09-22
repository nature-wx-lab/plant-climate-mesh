# 植物気候メッシュ

世界地図をクリックし、その位置に対応するNASA POWER気象格子の1991–2020年気候平均を表示するNature Wx Labの公開試作ツールです。

- 公開URL: `https://nature-wx-lab.github.io/plant-climate-mesh/`
- 表示要素: 地上2m気温、補正済み降水量、全天日射量、地上2m相対湿度
- 全球分布図: 年平均と1〜12月を切り替え、4要素の1991–2020年平均をWebメルカトル地図へ表示
- 表示値: 年平均、日最高・日最低気温、全天日射量、日平均相対湿度の日別気候平均、月別グラフ、平均日最高・平均日最低を含む月別数値表
- 画面: 左パネルで気象要素・期間・濃さ・気候区分を操作し、地点詳細は初期16:9の浮動パネルに表示。薄い1段ヘッダーのドラッグで移動し、四隅のドラッグで0.65〜1.45倍へ等比拡縮できる。概要・気温・降水・日射・湿度・月別を上部タブで切り替え、通常画角では各ページをパネル内に収める（月別表は狭い画面だけ表内スクロール）
- 地図: Webメルカトル図法、Natural Earth 1:50m境界。クリックした気象格子中心の国・地域名と首都を表示
- 気候区分: Beckほか（2023）のケッペン＝ガイガー気候区分1991–2020年・0.1°版を、ボタンで重ね合わせ表示
- 地図操作: ホイールで拡大縮小、左ドラッグで移動。地点クリックでは現在の縮尺を維持。東西方向は境界なく連続移動
- 気温グラフ: 縦軸は5℃刻みで、0℃と30℃を強調。0〜35℃は常時表示し、データが範囲外の場合は5℃単位で拡張
- 降水量: APIの月別日平均量を1991〜2020年の各月の平均日数で月降水量へ換算。年表示も同期間の平均日数で年降水量へ換算

## データ契約

### 全球分布図

全球分布図はNASA POWER Data v10の公開AWS Zarr月別データから事前生成した静的PNGです。ブラウザからAWSへ接続せず、選択された要素・期間の画像だけを同一GitHub Pages配信元から読み込みます。

- 気温・降水量・相対湿度: `power_merra2_monthly_temporal_lst.zarr`、元格子0.5°緯度×0.625°経度
- 日射量の1991〜2000年: `power_srb_monthly_temporal_lst.zarr`、元格子1°×1°
- 日射量の2001〜2020年: `power_syn1deg_monthly_temporal_lst.zarr`、元格子1°×1°
- 期間: 1991年1月〜2020年12月、Local Solar Time
- 月表示: 同じ月を30年分平均。降水量は月の日数を掛けた月降水量
- 年表示: 気温・湿度・日射量は月の日数で加重した年平均、降水量は12か月の月降水量の合計
- 投影: 元格子の最近傍値を2048×2048ピクセルのWebメルカトル画像へ変換。格子間の平滑化は行わない

分布図は値域外を凡例の端色へ丸めて着色します。地点クリック時の数値は画像の色から逆算せず、次項のAPIから元の数値を取得します。

### 地点詳細

ブラウザは地点選択時だけNASA POWER Climatology APIへ問い合わせます。

```text
https://power.larc.nasa.gov/api/temporal/climatology/point
parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M
community=AG
start=1991
end=2020
format=JSON
```

同時にDaily APIから1991年1月1日〜2020年12月31日の`T2M_MAX`、`T2M_MIN`、`ALLSKY_SFC_SW_DWN`、`RH2M`を取得し、日最高気温、日最低気温、1日合計全天日射量、日平均相対湿度を各暦日について平均します。通常日は30年分、2月29日は8年分です。月別数値表では、各月に含まれる有効な日最高・日最低気温をそれぞれ平均します。API応答が欠けた日は集計から除き、日別データだけ取得できない場合も月別・年平均値は表示します。

橙枠は、クリック位置に最も近いMERRA-2格子中心へそろえた約0.5°緯度×0.625°経度の気象格子です。MERRA-2の格子中心は緯度0.5°、経度0.625°間隔で並ぶため、気温・補正済み降水量・相対湿度は橙枠に対応する元格子の空間平均として扱います。白い小点はAPIへ送る格子中心です。日射量は同じ中心座標に対応する別の1°×1°格子から取得するため、橙枠と日射格子の範囲は一致しません。

独自算出値を気象庁の公式な「平年値」と呼ばず、画面では「1991–2020年の気候平均」と表示します。降水量はAPIの月別・年平均日量に、1991〜2020年の各月または1年の平均日数を掛けて月降水量・年降水量へ換算します。この30年間には閏年が8回あるため、2月は28＋8/30日、1年は365＋8/30日として計算します。

国・地域はNatural Earth 1:50m Admin 0 Countriesのポリゴンに気象格子中心が含まれるかをブラウザ内で判定します。首都はNatural Earth 1:10m Populated Placesの国首都・地域首府属性を使います。海上、境界付近、首都属性がない地域では「—」になる場合があります。

気候区分レイヤーは、FigshareでCC0配布されているBeckほか（2023）の1991–2020年・0.1°版を、4096×4096ピクセルのWebメルカトル画像へ最近傍法で再投影したものです。色と30区分は配布凡例に合わせています。元の1km版をそのまま配信するものではなく、広域傾向を地図上で比較する表示です。

## プライバシーとセキュリティ

- Cookie、アクセス解析、現在地取得、フォーム、アカウント機能、永続的な端末保存を使用しない
- NASA POWERへのリクエストは気象格子の中心座標だけを送り、`credentials: omit` と `referrerPolicy: no-referrer` を指定
- 外部JavaScript、外部CSS、広告タグを読み込まない
- Content Security Policyで接続先をNASA POWERだけに限定
- API応答をHTMLとして挿入せず、検証した数値だけを`textContent`で表示
- 直前のリクエストを中止し、連続クリックで古い応答が新しい地点を上書きしない
- 公開成果物を固定allowlistから組み立て、SHA-256 manifestと公開後の全ファイル照合を行う
- 公開前CIで現行ファイルと到達可能なGit履歴、author/committer identity、秘密情報らしい文字列を検査
- このローカルcloneは`.githooks/pre-push`を有効化し、GitHubへ送る前にも同じ全ファイル・全履歴検査を実行
- GitHub Secret scanningとPush protectionを有効化
- GitHub ActionsはGitHub公式Actionだけを許可し、完全なcommit SHAで固定。既定権限はreadで、pull request承認権限を与えない

地点選択時には、中心座標と通常の通信情報がNASA POWERへ送信されます。この外部送信は画面にも常時表示します。

## ローカル確認

```bash
python3 scripts/verify_contract.py
python3 scripts/privacy_gate.py
python3 -m http.server 8765
```

`http://127.0.0.1:8765/` を開きます。

全球分布図を同じ入力から再生成する場合は、専用の仮想環境で次を実行します。通常のUI確認では再生成不要です。

```bash
python3 -m venv /tmp/plant-climate-layer-venv
/tmp/plant-climate-layer-venv/bin/python -m pip install -r scripts/climate_layers_requirements.txt
/tmp/plant-climate-layer-venv/bin/python scripts/build_climate_layers.py
```

## 公開

`privacy-gate.yml`はpushとpull requestで公開ファイルと全履歴を検査します。`pages.yml`は同じ検査に合格した固定allowlistだけをPages成果物にし、公開後にsource commit、全ファイルのbyte数とSHA-256、HTTPS、HSTS、404を検証します。

新しいcloneでpush前検査を有効にする場合は、repo直下で次を1回実行します。

```bash
git config core.hooksPath .githooks
```

公開用Git identityは次の2種類だけを許可します。

- `nature-wx-lab` / `nature-wx-lab@users.noreply.github.com`
- `github-actions[bot]` / `41898282+github-actions[bot]@users.noreply.github.com`

## 出典と利用条件

詳細は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。
